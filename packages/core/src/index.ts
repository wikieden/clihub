/**
 * @clihub/core — public entrypoint.
 */
export * from './types.js';
export * from './tools/types.js';
export {
  getProvider,
  listProviders,
  registerProvider,
} from './tools/registry.js';
export { claudeCodeProvider } from './tools/providers/claude-code.js';
export { codexProvider } from './tools/providers/codex.js';
export { kiroProvider } from './tools/providers/kiro.js';
export { geminiProvider } from './tools/providers/gemini.js';
export { cursorProvider } from './tools/providers/cursor.js';
export { gooseProvider } from './tools/providers/goose.js';
export {
  makeProvider,
  validateProviderSpec,
  parseProvidersJson,
  defaultProvidersPath,
  readProviderSpecsFile,
  addProviderSpec,
  removeProviderSpec,
  loadExternalProviders,
  type DeclarativeProviderSpec,
  type DeclarativeInstall,
  type ProviderSpecsFile,
  type MakeProviderOpts,
  type LoadExternalProvidersOpts,
  type LoadExternalProvidersResult,
} from './tools/declarative.js';
export { JsonSettingsAdapter } from './settings/index.js';
export { TomlSettingsAdapter, type TomlSettingsAdapterOpts } from './settings/toml.js';
export {
  BackupManager,
  defaultBackupRoot,
  timestamp,
  type BackupEntry,
  type BackupOptions,
} from './backup/index.js';
export { ClaudeCodeSkillAdapter } from './skill/index.js';
export {
  parseSkillMd,
  type SkillMdParsed,
} from './skill-md/parser.js';
export {
  findSkillMd,
  manifestFromSkillMd,
  discoverSkillMdRepo,
  type SkillMdLocation,
} from './skill-md/manifest.js';
export { CodexSkillAdapter } from './skill/codex-adapter.js';
export { KiroCliSkillAdapter } from './skill/kiro-adapter.js';
export { GeminiCliSkillAdapter } from './skill/gemini-adapter.js';
export {
  JsonMcpAdapter,
  type McpAdapter,
  type JsonMcpAdapterOpts,
} from './mcp/index.js';
export {
  listMcp,
  addMcp,
  removeMcp,
  type McpListRow,
  type McpManageResult,
  type McpManageOpts,
  type AddMcpOpts,
} from './mcp/manage.js';
export {
  GitClonePluginAdapter,
  ClaudeCodePluginAdapter,
  type PluginAdapter,
  type GitClonePluginAdapterOpts,
} from './plugin/index.js';
export {
  runHealthMatrix,
  attemptAutoRepair,
  probeNetwork,
  type ToolHealthRow,
  type RepairAction,
  type RepairResult,
  type NetworkProbe,
} from './doctor/index.js';
export { whichCmd } from './utils/which.js';
export { parseVersion } from './utils/version.js';
export {
  startWatch,
  type WatchEvent,
  type WatchOpts,
  type WatchHandle,
} from './watch/index.js';
export {
  searchCatalog,
  type SearchHit,
  type SearchCategory,
} from './search/index.js';
export {
  generateCompletion,
  type CompletionShell,
} from './completion/index.js';
export { generateMan } from './man/index.js';
export {
  loadConfig,
  saveConfig,
  setConfigKey,
  getConfigKey,
  resolveProxy,
  proxyEnvVector,
  defaultConfigPath,
  type ClihubConfig,
  type ConfigIoOpts,
} from './config/index.js';
export {
  formatErrorMessage,
  createError,
  listErrors,
  type ClihubError,
  type ClihubErrorCode,
} from './errors/index.js';
export {
  createProfile,
  useProfile,
  listProfiles,
  currentProfile,
  removeProfile,
  cloneProfile,
  readProfileMeta,
  writeProfileMeta,
  profileEnvVector,
  validateProfileName,
  defaultProfilesRoot,
  currentProfileLink,
  PROFILE_VENDORS,
  type ProfileMeta,
  type ProfileBaseUrls,
  type CreateProfileOpts,
  type UseProfileOpts,
  type UseProfileResult,
  type ProfileRootOpts,
  type VendorId,
} from './profile/index.js';
export {
  applyProfileBaseUrls,
  clearProfileBaseUrl,
  type BaseUrlPatch,
  type ApplyBaseUrlsOpts,
} from './profile/baseurls.js';
export {
  setToolProxy,
  getToolProxy,
  applyProxyEnv,
  readProxyFromEnv,
} from './proxy/inject.js';
export {
  detectSystemProxy,
  parseScutilProxy,
  type SystemProxy,
  type DetectProxyOpts,
} from './proxy/detect.js';
export {
  profileHook,
  type HookShell,
} from './profile/hook.js';
export {
  setSecret,
  getSecret,
  removeSecret,
  listSecrets,
  currentKeychain,
  assertSecureKeychain,
  type KeychainBackend,
  type KeychainInfo,
} from './auth/keychain.js';
export {
  inspectCredentials,
  CREDENTIAL_SOURCES,
  type CredentialSource,
  type CredentialStatus,
  type InspectOpts,
} from './auth/credentials.js';
export {
  readAuthProviders,
  getAuthProvider,
  startDeviceLogin,
  pollDeviceToken,
  writeNativeCredential,
  refreshToken,
  readNativeRefreshToken,
  generatePkce,
  randomState,
  buildAuthorizeUrl,
  captureLoopbackCode,
  exchangeAuthorizationCode,
  defaultAuthProvidersPath,
  type AuthProviderConfig,
  type AuthProvidersFile,
  type AuthIoOpts,
  type DeviceCodeResponse,
  type TokenResult,
  type Pkce,
  type LoopbackCapture,
} from './auth/login.js';
export {
  appendAudit,
  defaultAuditPath,
  setAuditBestEffort,
  type AuditActor,
  type AuditEntry,
  type AuditEntryBase,
} from './audit/index.js';
export {
  findClihubYaml,
  loadClihubYaml,
  parseTopLevelYaml,
  type ClihubYamlMeta,
} from './clihubyaml/index.js';
export {
  parseClihubYaml,
  type ClihubYamlConfig,
  type YamlToolEntry,
  type YamlSkillEntry,
  type YamlMcpEntry,
  type YamlPluginEntry,
} from './clihubyaml/full.js';
export {
  planApply,
  runApply,
  generateLockfile,
  writeLockfile,
  readLockfile,
  type PlanItem,
  type PlanVerb,
  type ApplyPlan,
  type ApplyResult,
  type Lockfile,
} from './apply/index.js';
export {
  resolveMemorySource,
  planMemory,
  generateMemory,
  applyManagedBlock,
  stripManagedBlock,
  renderTarget,
  MEMORY_TARGETS,
  MEMORY_SOURCE_CANDIDATES,
  MEMORY_START,
  MEMORY_END,
  type MemoryTarget,
  type MemorySource,
  type MemoryVerb,
  type MemoryPlanItem,
  type MemoryOptions,
  type MemoryResult,
} from './memory/index.js';
export {
  collectBundle,
  encryptBundle,
  decryptBundle,
  planRestore,
  applyRestore,
  type SyncFile,
  type SyncBundle,
  type SyncIoOpts,
  type RestoreVerb,
  type RestoreItem,
  type RestoreResult,
  type ApplyRestoreOpts,
} from './sync/index.js';
export {
  clihubYamlSchema,
  clihubYamlSchemaJson,
  CLIHUB_YAML_SCHEMA_ID,
} from './schema/index.js';
export {
  ciWorkflow,
  defaultCiPath,
  CI_PROVIDERS,
  type CiProvider,
  type CiOpts,
} from './ci/index.js';
export {
  packManifest,
  PACK_TARGETS,
  type PackTarget,
  type PackOpts,
} from './pack/index.js';
export {
  addTeam,
  listTeams,
  removeTeam,
  pullTeam,
  applyTeam,
  pushTeam,
  defaultTeamRoot,
  TEAM_FILES,
  type TeamIoOpts,
  type TeamSyncResult,
} from './team/index.js';
export {
  checkConformance,
  type ConformanceCheck,
  type ConformanceReport,
} from './conformance/index.js';
export {
  recommend,
  detectProjectSignals,
  type Recommendation,
  type RecommendKind,
  type RecommendOptions,
} from './recommend/index.js';
export {
  diffLockfiles,
  compareVersions,
  type LockDiff,
  type DiffEntry,
  type ChangeKind,
} from './diff/index.js';
export {
  generateClihubYaml,
  scaffoldFromInstalled,
  type GenerateYamlOpts,
  type SkillEntry,
  type ScaffoldOpts,
  type Scaffold,
} from './init/index.js';
export {
  planWizard,
  memoryTemplate,
  type WizardAnswers,
  type WizardAccount,
  type WizardPlan,
} from './wizard/index.js';
export {
  scaffoldFiles,
  writeScaffold,
  type ScaffoldResult,
} from './scaffold/index.js';
export {
  computeStatus,
  type ComplianceState,
  type StatusItem,
  type StatusReport,
} from './status/index.js';
export {
  recordVersion,
  readHistory,
  previousVersion,
  defaultHistoryDir,
  type VersionRecord,
  type VersionHistory,
  type HistoryIoOpts,
} from './version/index.js';
export {
  auditSkills,
  auditSkill,
  type SkillRisk,
  type SkillAuditEntry,
  type SkillAuditOpts,
} from './skill-audit/index.js';
export { CatalogLoader, type Catalog } from './catalog/index.js';
export {
  addCatalogSource,
  removeCatalogSource,
  setSourcePriority,
  syncAllSources,
  readSources,
  orderedSourceDirs,
  defaultSourcesPath,
  catalogSourcesRoot,
  type CatalogSource,
  type SourcesFile,
  type SourcesIoOpts,
} from './catalog/sources.js';
export {
  generateCatalogKeypair,
  keyIdFor,
  canonicalPayload,
  signCatalogPayload,
  verifyCatalogPayload,
  type CatalogKeypair,
  type SignablePayload,
} from './catalog/signing.js';
export {
  defaultTrustPath,
  readTrustStore,
  addTrustedKey,
  removeTrustedKey,
  listTrustedKeys,
  findTrustedKey,
  type TrustedKey,
  type TrustStore,
  type TrustIoOpts,
} from './catalog/trust.js';
export {
  signCatalogDir,
  verifyCatalogSignature,
  type CatalogSigStatus,
} from './catalog/sync.js';
export {
  syncCatalog,
  readCatalogManifest,
  verifyCatalog,
  defaultCatalogDir,
  DEFAULT_CATALOG_URL,
  CATALOG_FILES,
  type CatalogManifest,
  type SyncCatalogOpts,
  type SyncResult,
} from './catalog/sync.js';
export {
  detectLocale,
  setLocale,
  getLocale,
  t,
  type Locale,
} from './i18n/index.js';
