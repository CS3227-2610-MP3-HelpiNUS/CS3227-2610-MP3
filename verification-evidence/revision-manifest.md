# Sprint 2 exact local executable revision

- Branch: `royden/feat-conversation-management`
- Committed HEAD before Sprint 2 finalization: `647639849e778cb6b9e2a6083d50d5d4cf40b9bd`
- State: selected executable file bytes at the final local checkpoint. The local finalization commit is the authoritative Git revision; no CI ran on it.
- Scope: selected F01/F02 production, configuration and changed test files, plus the pre-existing dirty deploy package file read by the package check. Unrelated pre-existing dirty agent/workflow files are excluded from this executable manifest.

| Repository file | SHA-256 of current bytes |
| --- | --- |
| `firestore.rules` | `d004c0c21c669eadd2ef17e87436e3412d0c47638a208a35d7fb834d052ad57e` |
| `firestore.indexes.json` | `0eb4edbc6dc5f4b2bf801bc214b7ff9bf1f750d714028b57696a661b44782ad0` |
| `src/functions/package.json` | `716b32393b90041f26e9213e388c3ad6cf94beb94ca25ac02f3be33ef021d63a` |
| `src/functions/deploy/package.json` | `02fb823567af0c810f24e5675c03312835f2217ff17115f02880c570548dfeaa` |
| `src/functions/src/helpRequests.ts` | `370e324759ec096dfbf882103afab2731b90cf46807d2989cb36fd3290600c32` |
| `src/functions/src/conversations.ts` | `f55127c81289257e66ddb181f32cbad7f723232890bba0f35f754fbfda65c684` |
| `src/functions/src/callable.test.ts` | `be0e221033c20ae2732e04066a31a9aed91d477c56b318764344e3ac2eca1021` |
| `src/functions/src/authSyntheticVerification.test.ts` | `30b751007a033cba7ca2ebdcff7b52cfcde51c4e3a92b8d0dd1a11a96992e22e` |
| `src/functions/src/helpRequestSyntheticVerification.test.ts` | `80352dbe48e15b3a8f71e2261aa65940c505875500d63cd2262364e454f84c4f` |
| `src/functions/src/index.ts` | `76a6758ce4ed93e4bedc578c7c0c2acff379efa1298bb1405385eb1c076fccfd` |
| `src/functions/integration-tests/f01F02Final.test.ts` | `c1b1a6f1a19949249ca32765400e200fb9289e2af3137d2496a83fd9ce3723dc` |
| `src/functions/integration-tests/f01AuthorizationMatrix.test.ts` | `077ac135e5151753876e50995ac4371e642d6b745b3095707f7cd078e3f26e38` |
| `src/functions/integration-tests/helpRequestAdapter.test.ts` | `52b46a25e72a1406abed57fc6acbcf3e12e7bc721f89f353a32862970b8ed932` |
| `src/functions/integration-tests/helpRequestCloseBoundary.test.ts` | `d4bc16a1f57f12ec616657eac1c717f17cfe0b7722922a488ddb966f5447dbab` |
| `src/functions/integration-tests/helpRequestContentBoundary.test.ts` | `e14af62c50f0fd63262e5d1b0e6358fbcd1db8b06bcf984175cec426e89812c8` |
| `src/functions/integration-tests/helpRequestCreationPersistence.test.ts` | `b7e796c2d2c9cc929a447fdebf247619ba5acb7ffe9f7838aaa2e64b07e62f9f` |
| `src/functions/integration-tests/helpRequestPagination.test.ts` | `f6e2fba3be3ce3a85741fc9e7e5408697658227ed081055be711e8f9096ec6d0` |
| `src/functions/integration-tests/helpRequestSelectionBoundary.test.ts` | `b460d61a6148cc780fb83832d3ec66741d243e8db12102b3e188ebdb8cf03946` |
| `src/functions/integration-tests/helpRequestReplayBoundary.test.ts` | `31a8b158ae62616712d1fad277df4068c5f205b89626ce34db2d1f164da88cce` |
| `src/functions/integration-tests/helpRequestAtomicAcceptance.test.ts` | `4624b65b3fc52e15c209399232948336292bb0372826e55e05e7c305555dc009` |
| `src/functions/integration-tests/helpRequestLostDecisionReply.test.ts` | `872c74c3c2d4eb67f5fcdba1b45ce29ff6fef87aa08686cd4d93569cd08d8cd0` |
| `src/functions/integration-tests/helpRequestConversationUniqueness.test.ts` | `67a286de3db87fecafb078144e3d253232d2932de5689b5d850ffe8720f15d5d` |
| `src/functions/integration-tests/helpRequestDuplicateReplay.test.ts` | `c78a692eec2366774b0b3051e872df32f2c7b8e7280b2c16bb6f87b90f596151` |
| `src/functions/integration-tests/helpRequestConversationListRules.test.ts` | `b6c81abd07e7c6f073067b850f4ac2c54045c49a9840908f7e13542e6feffe9b` |
| `src/functions/integration-tests/conversations.test.ts` | `52f9451cf6ebac0a783cfcb80a1f67b4be90092361edaac241dda3aa38e2a637` |
| `src/functions/integration-tests/conversationReplayAuthority.test.ts` | `ce951b0e43602c884d52451665071a3e560eb76fcb263f3e60499a9f696cd43d` |
| `src/functions/integration-tests/conversationReadReceipt.test.ts` | `99b0066453f9bd6feb08d4c03dc51a4a144b69dcf4ea164d8342225a8fc2bbfe` |
| `src/functions/rules-tests/access.test.ts` | `5e8bb8bff384a1cc153bd8d8b9efdbac58c774790faf1a4f7a6aea41bda2d9bb` |
| `src/frontend/src/pages/ConversationPages.tsx` | `eb3b95403a1943489bf86daf92e19bf8119af88d4d7d5c6031c5f5cf3409301f` |
| `src/frontend/src/pages/HelpRequestPages.tsx` | `16ae1b3250878b54ec1b624e9d04776423de2b9658d5f27d38e149c71ec8bed0` |
| `src/frontend/src/pages/MentorDiscoveryPage.tsx` | `63ee7115b8b39bb052ddb7f7fc0b4b51128abdc885b5add8e5c2497de99f13fe` |
| `src/frontend/src/services/firebaseConversations.ts` | `3298f00672b20c4b5ff936ffd51e662e342f9423bf74a35e0d993a0f1084219c` |
| `src/frontend/src/services/ServiceProvider.tsx` | `155854244c8e12527abdc0fad5d03f2e250124174bdaefe42b707cba6e0e99ed` |
| `src/frontend/src/services/chatRetryStore.ts` | `2b75b751b52541aacc40dc559cd02d179dac82a08c2cd25ea95c00bf13a394c6` |
| `src/frontend/src/test/conversations.test.tsx` | `599d07dbae3a9c4ca60f92fbdc1b5a294c9889786c8a1fdef9d54bde7802e650` |
| `src/frontend/src/test/conversationReplayAuthority.test.tsx` | `20a51c0ca20cc2fff0727d203da29c506c2a5afba3c08de4e6829c71efebf04f` |
| `src/frontend/src/test/conversationReadReceipt.test.tsx` | `6cf27b621af12db94821a2e0d80a13ad7f6e0607def08d1f63d8f43c798c09cb` |
| `src/frontend/src/test/conversationUncertainSend.test.tsx` | `e143612f4e6ad6a8b7a5f2660bf8f1ef735064741ebb446f93db641db548ace7` |
| `src/frontend/src/test/conversationLiveDisconnect.test.tsx` | `064066854f15688c85ef7e4f54b753a5ab034ffba44c0bc02e8a7351111bbc6d` |
| `src/frontend/src/test/conversationOfflineAdapter.test.ts` | `b69f267fbcdd8506238c0d006e038fd21faefeab63d86744dcd44db007642a45` |
| `src/frontend/src/test/conversationPageContinuity.test.tsx` | `72ec5389a8b04e3ea62fde5f3a9b7b83829b77c9ace1adedef63a749dfecd44e` |
| `src/frontend/src/test/conversationStorageBoundary.test.tsx` | `0b38984f766a5abc052e474b4ce75ccaf57bd4b0d072d5c3577ee91c9af94d4e` |
| `src/frontend/src/test/chatRetryStore.test.ts` | `95c065bf9e076f5fbb770f19e2b8254bf5606994dc893094a05018c795dd46b5` |
| `src/frontend/src/test/helpRequests.test.tsx` | `fe4047367c30161247d00cfcb17fc9a98735012c99af2e24e86dfcc5c261efbe` |
| `src/frontend/src/test/helpRequestIdentityAdapters.test.ts` | `25484f18e22781f94f6ca9f76195b197705f867480707f502bcc3e01f21a1fd3` |
| `src/frontend/src/test/mentorDashboard.test.tsx` | `08826147713cef08e508f35c17f6861144ce7bc86b2856ca845a2654adae1521` |
| `src/shared/src/contracts.test.ts` | `e98df688a8e0352f72e2c7b39b3f4a3d5085a4fb5605e5fdbb771f80f4e78db7` |
| `src/shared/src/conversations.test.ts` | `0190b6890e96cd45eb4e7df6089c1b99624e901ae8158319e45c556efefc4a0c` |
