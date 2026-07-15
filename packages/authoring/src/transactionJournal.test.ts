import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  hashAuthoringTransactionBytes,
  publishAuthoringTransaction,
  recoverAuthoringTransactions,
  type IAuthoringTransactionFile,
} from "./transactionJournal.js";

test("changed base hash rejects stale plan", async () => {
  const root = await createProject("stale-plan");
  try {
    const firstPath = join(root, "content/first.json");
    const secondPath = join(root, "content/second.json");
    const firstBefore = await readFile(firstPath);
    const secondBefore = await readFile(secondPath);
    const files = transactionFiles(firstBefore, secondBefore);
    const manualBytes = bytes("manual edit");
    await writeFile(firstPath, manualBytes);

    const result = await publishAuthoringTransaction({ files, projectPath: root });

    assert.equal(result.ok, false);
    assert.equal(result.committed, false);
    assert.deepEqual(result.filesWritten, []);
    assert.deepEqual(await readFile(firstPath), manualBytes);
    assert.deepEqual(await readFile(secondPath), secondBefore);
    const conflict = result.diagnostics.find((diagnostic) => diagnostic.code === "TN_AUTHORING_BATCH_CONFLICT");
    assert.deepEqual(conflict?.value, {
      actualHash: hashAuthoringTransactionBytes(manualBytes),
      expectedHash: hashAuthoringTransactionBytes(firstBefore),
      path: "content/first.json",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("promotion failure restores all old files", async () => {
  // prepared, publishing, two old->backup renames, and two stage->target renames
  for (let afterTransition = 1; afterTransition <= 6; afterTransition += 1) {
    const root = await createProject(`rollback-${afterTransition}`);
    try {
      const firstBefore = await readFile(join(root, "content/first.json"));
      const secondBefore = await readFile(join(root, "content/second.json"));
      const result = await publishAuthoringTransaction({
        faultInjection: { afterTransition, mode: "error" },
        files: transactionFiles(firstBefore, secondBefore),
        projectPath: root,
      });

      assert.equal(result.ok, false, `transition ${afterTransition}`);
      assert.equal(result.committed, false, `transition ${afterTransition}`);
      assert.deepEqual(await readFile(join(root, "content/first.json")), firstBefore);
      assert.deepEqual(await readFile(join(root, "content/second.json")), secondBefore);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("recovery completes one coherent state after interruption", async () => {
  // Include prepared, publishing, every rename, committed, and cleanup.
  for (let afterTransition = 1; afterTransition <= 8; afterTransition += 1) {
    const root = await createProject(`recovery-${afterTransition}`);
    try {
      const firstBefore = await readFile(join(root, "content/first.json"));
      const secondBefore = await readFile(join(root, "content/second.json"));
      await assert.rejects(publishAuthoringTransaction({
        faultInjection: { afterTransition, mode: "interrupt" },
        files: transactionFiles(firstBefore, secondBefore),
        projectPath: root,
        transactionId: `interrupted-${afterTransition}`,
      }), /Injected authoring transaction interruption/);

      const recovery = await recoverAuthoringTransactions({ projectPath: root });

      assert.equal(recovery.ok, true);
      assert.equal(recovery.recovered, afterTransition < 8);
      const pair = [
        (await readFile(join(root, "content/first.json"), "utf8")).trim(),
        (await readFile(join(root, "content/second.json"), "utf8")).trim(),
      ];
      const expectedPair = afterTransition < 7 ? ["first old", "second old"] : ["first new", "second new"];
      assert.deepEqual(pair, expectedPair, `transition ${afterTransition} must recover one coherent state`);
      await assert.rejects(readFile(join(root, `.tn/authoring-transactions/interrupted-${afterTransition}/journal.json`)), { code: "ENOENT" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("committed cleanup failure never rolls durable files back", async () => {
  const root = await createProject("committed-cleanup");
  try {
    const firstBefore = await readFile(join(root, "content/first.json"));
    const secondBefore = await readFile(join(root, "content/second.json"));
    const result = await publishAuthoringTransaction({
      faultInjection: { afterTransition: 7, mode: "error" },
      files: transactionFiles(firstBefore, secondBefore),
      projectPath: root,
      transactionId: "committed-cleanup",
    });

    assert.equal(result.ok, true);
    assert.equal(result.committed, true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_TRANSACTION_CLEANUP_DEFERRED"), true);
    assert.equal((await readFile(join(root, "content/first.json"), "utf8")).trim(), "first new");
    assert.equal((await readFile(join(root, "content/second.json"), "utf8")).trim(), "second new");

    const recovery = await recoverAuthoringTransactions({ projectPath: root });
    assert.equal(recovery.ok, true);
    assert.equal(recovery.recovered, true);
    assert.equal((await readFile(join(root, "content/first.json"), "utf8")).trim(), "first new");
    assert.equal((await readFile(join(root, "content/second.json"), "utf8")).trim(), "second new");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("corrupt recovery journal fails closed", async () => {
  const root = await createProject("corrupt-recovery");
  try {
    const journalPath = join(root, ".tn/authoring-transactions/corrupt/journal.json");
    await mkdir(join(root, ".tn/authoring-transactions/corrupt"), { recursive: true });
    await writeFile(journalPath, "{ not json\n");

    const recovery = await recoverAuthoringTransactions({ projectPath: root });

    assert.equal(recovery.ok, false);
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.diagnostics[0]?.code, "TN_AUTHORING_TRANSACTION_RECOVERY_FAILED");
    assert.equal(await readFile(journalPath, "utf8"), "{ not json\n");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("parallel commits serialize verify and publish", async () => {
  const root = await createProject("parallel");
  try {
    const firstBefore = await readFile(join(root, "content/first.json"));
    const secondBefore = await readFile(join(root, "content/second.json"));
    const base = transactionFiles(firstBefore, secondBefore);
    const [left, right] = await Promise.all([
      publishAuthoringTransaction({
        files: base.map((file) => ({ ...file, bytes: bytes(`left ${file.path}`) })),
        projectPath: root,
        transactionId: "parallel-left",
      }),
      publishAuthoringTransaction({
        files: base.map((file) => ({ ...file, bytes: bytes(`right ${file.path}`) })),
        projectPath: root,
        transactionId: "parallel-right",
      }),
    ]);

    const committed = [left, right].filter((result) => result.committed);
    const rejected = [left, right].filter((result) => !result.committed);
    assert.equal(committed.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.diagnostics.every((diagnostic) => diagnostic.code === "TN_AUTHORING_BATCH_CONFLICT"), true);
    const winner = committed[0]?.transactionId === "parallel-left" ? "left" : "right";
    assert.equal((await readFile(join(root, "content/first.json"), "utf8")).trim(), `${winner} content/first.json`);
    assert.equal((await readFile(join(root, "content/second.json"), "utf8")).trim(), `${winner} content/second.json`);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function transactionFiles(firstBefore: Uint8Array, secondBefore: Uint8Array): IAuthoringTransactionFile[] {
  return [
    {
      baseHash: hashAuthoringTransactionBytes(firstBefore),
      bytes: bytes("first new"),
      path: "content/first.json",
    },
    {
      baseHash: hashAuthoringTransactionBytes(secondBefore),
      bytes: bytes("second new"),
      path: "content/second.json",
    },
  ];
}

async function createProject(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `tn-authoring-journal-${label}-`));
  await mkdir(join(root, "content"), { recursive: true });
  await writeFile(join(root, "content/first.json"), bytes("first old"));
  await writeFile(join(root, "content/second.json"), bytes("second old"));
  return root;
}

function bytes(value: string): Buffer {
  return Buffer.from(`${value}\n`);
}
