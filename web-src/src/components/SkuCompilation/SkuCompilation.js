import React, { useEffect, useRef, useState } from "react";
import { View, Flex, Heading, Text, Divider, Button } from "@adobe/react-spectrum";
import RecentBatches from "../RecentBatches";
import CsvUpload from "../CsvUpload/CsvUpload";
import TemplateGrid, {
  ADDITIONAL_TEMPLATES,
} from "../TemplateGrid/TemplateGrid";
import WorkflowInfo from "../WorkflowInfo/WorkflowInfo";
import CurlPreview from "../CurlPreview/CurlPreview";
import ExecutionStatus from "../ExecutionStatus/ExecutionStatus";
import {
  uploadFile,
  getDefaultTemplate,
  getDefaultAdditionalTemplates,
  refreshPresignedUrl,
} from "../../services/uploadService";
import { readCsvPreview, readCsvRows } from "../../services/csvService";
import {
  executeWorkflow,
  checkWorkflowStatus,
  checkWorkflowExecutions,
  cancelBatch,
  summarizeExecutionFailures,
  isTerminalStatus,
  isFailedStatus,
} from "../../services/workflowService";
import { WORKFLOW_DISPLAY_NAME } from "../../workflowConfig";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_TIME_MS = 10 * 60 * 1000;
const MAX_POLL_FAILURES = 3;

function SectionHeading({ children }) {
  return (
    <Heading
      level={4}
      margin={0}
      UNSAFE_style={{
        letterSpacing: 1,
        color: "var(--spectrum-global-color-gray-700)",
        fontSize: 12,
      }}
    >
      {children}
    </Heading>
  );
}

export default function SkuCompilation() {
  const [csv, setCsv] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState(null);

  const [template, setTemplate] = useState(null);
  const [templateUploading, setTemplateUploading] = useState(true);
  const [templateError, setTemplateError] = useState(null);

  const [additionalTemplates, setAdditionalTemplates] = useState(() =>
    Object.fromEntries(
      ADDITIONAL_TEMPLATES.map((t) => [
        t.id,
        { value: null, isUploading: true, error: null },
      ]),
    ),
  );

  const [executionState, setExecutionState] = useState("ready");
  const [executionError, setExecutionError] = useState(null);
  const [batchId, setBatchId] = useState(null);
  const [statusResult, setStatusResult] = useState(null);
  const [executionsDetail, setExecutionsDetail] = useState(null);
  const [executionDurationMs, setExecutionDurationMs] = useState(null);

  const isExecuting = executionState === "running";
  const pollTimerRef = useRef(null);
  const pollStartRef = useRef(0);

  useEffect(() => () => clearTimeout(pollTimerRef.current), []);

  // Ticks every second off the wall clock (Date.now() - start), independent of the
  // 4s status-poll cadence — so "Elapsed"/"Time taken" reads as a real running
  // clock instead of jumping in 4s steps whenever a poll happens to land.
  useEffect(() => {
    if (!isExecuting) return
    const id = setInterval(() => {
      setExecutionDurationMs(Date.now() - pollStartRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [isExecuting]);

  // Seed the primary template — uploaded once out-of-band to a fixed S3 key
  // (same as the 6 additional templates); this only re-presigns a fresh GET.
  useEffect(() => {
    (async () => {
      try {
        const uploaded = await getDefaultTemplate();
        setTemplate({ ...uploaded, isDefault: true });
      } catch (e) {
        setTemplateError(e.message || "Could not load the default PSD template.");
      } finally {
        setTemplateUploading(false);
      }
    })();
  }, []);

  // Seed the 6 additional templates — uploaded once via a one-off script to fixed
  // S3 keys, re-presigned fresh on every load via default-additional-templates.
  useEffect(() => {
    (async () => {
      try {
        const templates = await getDefaultAdditionalTemplates();
        setAdditionalTemplates((prev) => {
          const next = { ...prev };
          for (const t of templates) {
            next[t.id] = {
              value: { ...t, isDefault: true },
              isUploading: false,
              error: null,
            };
          }
          return next;
        });
      } catch (e) {
        setAdditionalTemplates((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(next)) {
            next[id] = {
              ...next[id],
              isUploading: false,
              error: "Could not load default. Upload manually.",
            };
          }
          return next;
        });
      }
    })();
  }, []);

  // The updated workflow graph has no CSV file input anymore — each row's 4 text
  // columns are fanned directly into per-row Input Text nodes, one execution per
  // row (see actions/libs/workflowPayload.js). So the CSV never needs an S3
  // upload; it's parsed entirely client-side into workflow-ready rows.
  async function handleCsvSelect(file, validationError) {
    if (validationError) {
      setCsvError(validationError);
      return;
    }
    setCsvError(null);
    setCsvUploading(true);
    try {
      const [preview, { rows, missingColumns }] = await Promise.all([
        readCsvPreview(file),
        readCsvRows(file),
      ]);
      if (missingColumns.length > 0) {
        setCsvError(
          `CSV is missing required column(s): ${missingColumns.join(", ")}`,
        );
        return;
      }
      setCsv({
        fileName: file.name,
        size: file.size,
        recordCount: preview.recordCount,
        headers: preview.headers,
        previewRows: preview.rows,
        rows,
      });
    } catch (e) {
      setCsvError(e.message);
    } finally {
      setCsvUploading(false);
    }
  }

  async function handleAdditionalTemplateSelect(id, file, validationError) {
    if (validationError) {
      setAdditionalTemplates((prev) => ({
        ...prev,
        [id]: { ...prev[id], error: validationError },
      }));
      return;
    }
    setAdditionalTemplates((prev) => ({
      ...prev,
      [id]: { ...prev[id], error: null, isUploading: true },
    }));
    try {
      const uploaded = await uploadFile(file, "psd");
      setAdditionalTemplates((prev) => ({
        ...prev,
        [id]: { value: uploaded, isUploading: false, error: null },
      }));
    } catch (e) {
      setAdditionalTemplates((prev) => ({
        ...prev,
        [id]: { ...prev[id], isUploading: false, error: e.message },
      }));
    }
  }

  const additionalTemplatesUploaded = ADDITIONAL_TEMPLATES.every(
    (t) => additionalTemplates[t.id].value,
  );
  const additionalTemplatesBusy = ADDITIONAL_TEMPLATES.some(
    (t) => additionalTemplates[t.id].isUploading,
  );

  const missingReasons = [];
  if (!csv) missingReasons.push("Upload a CSV file to continue.");
  else if (csv.rows.length === 0) missingReasons.push("CSV has no data rows.");
  if (!template)
    missingReasons.push(templateError || "A primary PSD template is required.");
  if (!additionalTemplatesUploaded)
    missingReasons.push("Upload all 6 PSD TEMPLATES to continue.");
  if (csvUploading || templateUploading || additionalTemplatesBusy)
    missingReasons.push("Waiting for uploads to finish.");

  async function loadFailureDetail(id) {
    try {
      const executions = await checkWorkflowExecutions(id);
      setExecutionsDetail(executions);
      const failures = summarizeExecutionFailures(executions);
      setExecutionError(
        failures.length > 0
          ? failures.join("\n")
          : "The workflow batch finished with a failed status.",
      );
    } catch (e) {
      setExecutionError(
        "The workflow batch finished with a failed status. (Could not load execution details: " +
          e.message +
          ")",
      );
    }
  }

  function pollStatus(id, consecutiveFailures = 0) {
    pollTimerRef.current = setTimeout(async () => {
      try {
        const status = await checkWorkflowStatus(id);
        setStatusResult(status);

        if (isTerminalStatus(status)) {
          // Freeze the final duration precisely at completion rather than waiting
          // for the next 1s tick, so it doesn't undercount by up to a second.
          setExecutionDurationMs(Date.now() - pollStartRef.current);

          if (isFailedStatus(status)) {
            setExecutionState("error");
            await loadFailureDetail(id);
          } else {
            setExecutionState("success");
          }
          return;
        }

        if (Date.now() - pollStartRef.current > MAX_POLL_TIME_MS) {
          setExecutionError(`Timed out waiting for completion. Batch: ${id}`);
          setExecutionState("error");
          return;
        }

        pollStatus(id, 0);
      } catch (e) {
        // A single failed poll (network blip, gateway timeout on a large status
        // payload) doesn't mean the batch itself failed — it's still running
        // server-side. Only surface an error after repeated consecutive
        // failures, or once we're out of time anyway.
        if (consecutiveFailures + 1 >= MAX_POLL_FAILURES || Date.now() - pollStartRef.current > MAX_POLL_TIME_MS) {
          setExecutionError(e.message);
          setExecutionState("error");
          return;
        }
        pollStatus(id, consecutiveFailures + 1);
      }
    }, POLL_INTERVAL_MS);
  }

  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    if (!batchId) return;
    setCancelling(true);
    try {
      await cancelBatch(batchId);
    } catch (e) {
      // The batch may already be past a cancellable state server-side — still
      // stop polling locally either way, the next status check would just 404/settle.
    } finally {
      setCancelling(false);
    }
    clearTimeout(pollTimerRef.current);
    setExecutionState("error");
    setExecutionError("Batch cancelled.");
  }

  async function handleExecute() {
    setExecutionState("running");
    setExecutionError(null);
    setStatusResult(null);
    setExecutionsDetail(null);
    setExecutionDurationMs(null);
    setBatchId(null);
    try {
      // Presigned URLs expire — re-mint fresh ones for every upload right before
      // submitting rather than trusting whatever was handed back at upload time,
      // since the user may have left the page open a while before hitting Execute.
      const [templatePresignedUrl, ...additionalTemplatePresignedUrls] =
        await Promise.all([
          refreshPresignedUrl(template.key),
          ...ADDITIONAL_TEMPLATES.map((t) =>
            refreshPresignedUrl(additionalTemplates[t.id].value.key),
          ),
        ]);

      const result = await executeWorkflow({
        rows: csv.rows,
        templatePresignedUrl,
        additionalTemplatePresignedUrls,
      });

      if (!result.batchId) {
        // No batch to poll — treat the accepted submission itself as done.
        setExecutionState("success");
        return;
      }

      setBatchId(result.batchId);
      pollStartRef.current = Date.now();
      pollStatus(result.batchId);
    } catch (e) {
      setExecutionError(e.message);
      setExecutionState("error");
    }
  }

  const canExecute = missingReasons.length === 0;

  return (
    <div className="ulta-main">
      <div className="ulta-grid">
        <div className="ulta-col">
          <View UNSAFE_className="ulta-fade-in">
            <Heading level={3} margin={0}>
              Batch Workflow Execution
            </Heading>
            <Text
              UNSAFE_style={{
                fontSize: 12,
                color: "var(--spectrum-global-color-gray-600)",
              }}
            >
              Upload your creative production inputs and trigger the Ulta
              Beauty Workflow Builder process.
            </Text>
          </View>

          <Flex direction="column" gap="size-75">
            <SectionHeading>CSV INPUT</SectionHeading>
            <CsvUpload
              value={csv}
              isUploading={csvUploading}
              error={csvError}
              disabled={isExecuting}
              onSelect={handleCsvSelect}
              onRemove={() => {
                setCsv(null);
                setCsvError(null);
              }}
            />
          </Flex>

          <Flex direction="column" gap="size-75">
            <SectionHeading>PSD TEMPLATES</SectionHeading>
            <TemplateGrid
              slots={additionalTemplates}
              disabled={isExecuting}
              onSelect={handleAdditionalTemplateSelect}
            />
          </Flex>
        </div>

        <div className="ulta-col">
          <RecentBatches />

          <Flex direction="column" gap="size-75">
            <Flex direction="row" justifyContent="space-between" alignItems="center">
              <SectionHeading>WORKFLOW</SectionHeading>
              <Button
                variant="accent"
                UNSAFE_className={`ulta-execute-btn${isExecuting ? " ulta-executing" : ""}`}
                UNSAFE_style={{
                  backgroundColor: canExecute ? "var(--ulta-accent)" : undefined,
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  transform: isExecuting ? "scale(0.98)" : "scale(1)",
                }}
                isDisabled={!canExecute || isExecuting}
                onPress={handleExecute}
              >
                <Flex gap="size-100" alignItems="center">
                  {isExecuting && <span className="ulta-spinner" aria-hidden="true" />}
                  <Text>{isExecuting ? "Executing..." : "Execute Workflow"}</Text>
                </Flex>
              </Button>
            </Flex>
            <View
              borderWidth="thin"
              borderColor="gray-300"
              borderRadius="medium"
              padding="size-200"
            >
              <WorkflowInfo
                workflowName={WORKFLOW_DISPLAY_NAME}
                missingReasons={missingReasons}
              />
              <View marginTop="size-150">
                <CurlPreview
                  isReady={canExecute}
                  rows={csv?.rows}
                  templatePresignedUrl={template?.presignedUrl}
                  additionalTemplatePresignedUrls={ADDITIONAL_TEMPLATES.map(
                    (t) => additionalTemplates[t.id].value?.presignedUrl,
                  )}
                />
              </View>
            </View>
          </Flex>

          <Divider size="S" />

          <Flex direction="column" gap="size-75" flex={1} minHeight={0}>
            <SectionHeading>EXECUTION</SectionHeading>
            <View
              borderWidth="thin"
              borderColor="gray-300"
              borderRadius="medium"
              padding="size-200"
              flex={1}
              minHeight={0}
              UNSAFE_style={{ overflow: "auto" }}
            >
              <ExecutionStatus
                state={executionState}
                csvRecordCount={csv?.recordCount}
                csvRowLabels={csv?.rows?.map((r) => r.filename)}
                batchId={batchId}
                statusResult={statusResult}
                executionsDetail={executionsDetail}
                errorMessage={executionError}
                durationMs={executionDurationMs}
                onCancel={handleCancel}
                isCancelling={cancelling}
              />
            </View>
          </Flex>
        </div>
      </div>
    </div>
  );
}
