"""Record the exact local executable files used for the final verification."""

from hashlib import sha256
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification-evidence" / "revision-manifest.md"
FILES = [
    "firestore.rules",
    "firestore.indexes.json",
    "src/functions/package.json",
    "src/functions/deploy/package.json",
    "src/functions/src/helpRequests.ts",
    "src/functions/src/conversations.ts",
    "src/functions/src/callable.test.ts",
    "src/functions/src/authSyntheticVerification.test.ts",
    "src/functions/src/helpRequestSyntheticVerification.test.ts",
    "src/functions/src/index.ts",
    "src/functions/integration-tests/f01F02Final.test.ts",
    "src/functions/integration-tests/f01AuthorizationMatrix.test.ts",
    "src/functions/integration-tests/helpRequestAdapter.test.ts",
    "src/functions/integration-tests/helpRequestCloseBoundary.test.ts",
    "src/functions/integration-tests/helpRequestContentBoundary.test.ts",
    "src/functions/integration-tests/helpRequestCreationPersistence.test.ts",
    "src/functions/integration-tests/helpRequestPagination.test.ts",
    "src/functions/integration-tests/helpRequestSelectionBoundary.test.ts",
    "src/functions/integration-tests/helpRequestReplayBoundary.test.ts",
    "src/functions/integration-tests/helpRequestAtomicAcceptance.test.ts",
    "src/functions/integration-tests/helpRequestLostDecisionReply.test.ts",
    "src/functions/integration-tests/helpRequestConversationUniqueness.test.ts",
    "src/functions/integration-tests/helpRequestDuplicateReplay.test.ts",
    "src/functions/integration-tests/helpRequestConversationListRules.test.ts",
    "src/functions/integration-tests/conversations.test.ts",
    "src/functions/integration-tests/conversationReplayAuthority.test.ts",
    "src/functions/integration-tests/conversationReadReceipt.test.ts",
    "src/functions/rules-tests/access.test.ts",
    "src/frontend/src/pages/ConversationPages.tsx",
    "src/frontend/src/pages/HelpRequestPages.tsx",
    "src/frontend/src/pages/MentorDiscoveryPage.tsx",
    "src/frontend/src/services/firebaseConversations.ts",
    "src/frontend/src/services/ServiceProvider.tsx",
    "src/frontend/src/services/chatRetryStore.ts",
    "src/frontend/src/test/conversations.test.tsx",
    "src/frontend/src/test/conversationReplayAuthority.test.tsx",
    "src/frontend/src/test/conversationReadReceipt.test.tsx",
    "src/frontend/src/test/conversationUncertainSend.test.tsx",
    "src/frontend/src/test/conversationLiveDisconnect.test.tsx",
    "src/frontend/src/test/conversationOfflineAdapter.test.ts",
    "src/frontend/src/test/conversationPageContinuity.test.tsx",
    "src/frontend/src/test/conversationStorageBoundary.test.tsx",
    "src/frontend/src/test/chatRetryStore.test.ts",
    "src/frontend/src/test/helpRequests.test.tsx",
    "src/frontend/src/test/helpRequestIdentityAdapters.test.ts",
    "src/frontend/src/test/mentorDashboard.test.tsx",
    "src/shared/src/contracts.test.ts",
    "src/shared/src/conversations.test.ts",
]


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


lines = [
    "# Sprint 2 exact local executable revision",
    "",
    f"- Branch: `{git('branch', '--show-current')}`",
    f"- Committed HEAD before Sprint 2 finalization: `{git('rev-parse', 'HEAD')}`",
    "- State: selected executable file bytes at the final local checkpoint. The local finalization commit is the authoritative Git revision; no CI ran on it.",
    "- Scope: selected F01/F02 production, configuration and changed test files, plus the pre-existing dirty deploy package file read by the package check. Unrelated pre-existing dirty agent/workflow files are excluded from this executable manifest.",
    "",
    "| Repository file | SHA-256 of current bytes |",
    "| --- | --- |",
]
for relative in FILES:
    path = ROOT / relative
    if not path.is_file():
        raise FileNotFoundError(path)
    lines.append(f"| `{relative}` | `{sha256(path.read_bytes()).hexdigest()}` |")
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {OUT} with {len(FILES)} file hashes")
