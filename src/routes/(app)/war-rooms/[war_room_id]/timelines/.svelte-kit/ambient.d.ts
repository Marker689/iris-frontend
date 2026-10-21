// this file is generated — do not edit it

/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 *
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 *
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 *
 * **_Private_ access:**
 *
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 *
 * For example, given the following build time environment:
 *
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 *
 * With the default `publicPrefix` and `privatePrefix`:
 *
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 *
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 *
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const ANTHROPIC_MODEL: string;
	export const GHOSTD_SOCKET: string;
	export const GHOSTME_PROXY_SHIM_BIND: string;
	export const GHOSTME_PROXY_SHIM_PORT: string;
	export const ANTHROPIC_FOUNDRY_BASE_URL: string;
	export const AI_AGENT: string;
	export const NODE_EXTRA_CA_CERTS: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const npm_config_user_agent: string;
	export const CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY: string;
	export const REMOTE_HOST_WORKSPACE: string;
	export const DISABLE_TELEMETRY: string;
	export const GIT_EDITOR: string;
	export const NODE_VERSION: string;
	export const HOSTNAME: string;
	export const GH_TOKEN: string;
	export const YARN_VERSION: string;
	export const ANTHROPIC_FOUNDRY_API_KEY: string;
	export const npm_node_execpath: string;
	export const GHOSTME_SSH_HOST_DIR: string;
	export const GHOSTME_WEB_DEV: string;
	export const SHLVL: string;
	export const npm_config_noproxy: string;
	export const PORT: string;
	export const HOME: string;
	export const OLDPWD: string;
	export const GH_REPO: string;
	export const npm_package_json: string;
	export const ANTHROPIC_DEFAULT_SONNET_MODEL: string;
	export const PUPPETEER_EXECUTABLE_PATH: string;
	export const GLITCHTIP_URL: string;
	export const CLAUDE_CODE_CHILD_SESSION: string;
	export const GHOSTME_HOOK_SOCKET: string;
	export const npm_config_userconfig: string;
	export const npm_config_local_prefix: string;
	export const USER_UID: string;
	export const GHOSTME_WEB_TOKEN: string;
	export const CLAUDE_CODE_USE_FOUNDRY: string;
	export const npm_config_engine_strict: string;
	export const GATEWAY_HOST: string;
	export const COLOR: string;
	export const CLAUDE_CONFIG_DIR: string;
	export const TMPDIR: string;
	export const GHOSTME_SESSION_ID: string;
	export const GH_HOST: string;
	export const GATEWAY_CA_NAME: string;
	export const GHOSTME_PROXY_SHIM_PUBLISH: string;
	export const _: string;
	export const npm_config_prefix: string;
	export const npm_config_npm_version: string;
	export const GHOSTME_SSH_AGENT_SOCK: string;
	export const GHOSTME_CLAUDE_DIR: string;
	export const npm_config_cache: string;
	export const GHOSTME_HOST_WORKSPACE: string;
	export const GATEWAY_PORT: string;
	export const ANTHROPIC_DEFAULT_OPUS_MODEL: string;
	export const PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: string;
	export const npm_config_node_gyp: string;
	export const PATH: string;
	export const GHOSTME_SSH_DIR: string;
	export const NEXT_TELEMETRY_DISABLED: string;
	export const NODE: string;
	export const npm_package_name: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const CLAUDE_EFFORT: string;
	export const DISABLE_ERROR_REPORTING: string;
	export const GHOSTME_CONTAINER: string;
	export const CLAUDE_PID: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
	export const npm_lifecycle_script: string;
	export const GHOSTME_DATA_DIR: string;
	export const SHELL: string;
	export const npm_package_version: string;
	export const npm_lifecycle_event: string;
	export const GHOSTME_REMOTE_HOST_WORKSPACE: string;
	export const CLAUDE_CODE_SESSION_ID: string;
	export const CLAUDE_CODE_VERSION: string;
	export const HOST_WORKSPACE: string;
	export const CLAUDECODE: string;
	export const GLITCHTIP_CAN_RESOLVE: string;
	export const npm_config_globalconfig: string;
	export const npm_config_init_module: string;
	export const PWD: string;
	export const GLITCHTIP_PROJECTS: string;
	export const DISABLE_AUTOUPDATER: string;
	export const npm_execpath: string;
	export const GLITCHTIP_TOKEN: string;
	export const CLAUDE_CODE_EXECPATH: string;
	export const npm_config_global_prefix: string;
	export const GHOSTME_AGENT_RELAY: string;
	export const npm_command: string;
	export const USER_GID: string;
	export const HISTFILE: string;
	export const GHOSTME_PROXY_SHIM_URL: string;
	export const CHROME_BIN: string;
	export const NODE_ENV: string;
	export const PUPPETEER_SKIP_DOWNLOAD: string;
	export const GLITCHTIP_ORG: string;
	export const INIT_CWD: string;
	export const EDITOR: string;
	export const TEST: string;
	export const VITEST: string;
	export const PROD: string;
	export const DEV: string;
	export const BASE_URL: string;
	export const MODE: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 *
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 *
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 *
 * **_Public_ access:**
 *
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 *
 * For example, given the following build time environment:
 *
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 *
 * With the default `publicPrefix` and `privatePrefix`:
 *
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 *
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 *
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 *
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 *
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 *
 * **_Private_ access:**
 *
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 *
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 *
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 *
 * For example, given the following runtime environment:
 *
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 *
 * With the default `publicPrefix` and `privatePrefix`:
 *
 * ```ts
 * import { env } from '$env/dynamic/private';
 *
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		ANTHROPIC_MODEL: string;
		GHOSTD_SOCKET: string;
		GHOSTME_PROXY_SHIM_BIND: string;
		GHOSTME_PROXY_SHIM_PORT: string;
		ANTHROPIC_FOUNDRY_BASE_URL: string;
		AI_AGENT: string;
		NODE_EXTRA_CA_CERTS: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		npm_config_user_agent: string;
		CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY: string;
		REMOTE_HOST_WORKSPACE: string;
		DISABLE_TELEMETRY: string;
		GIT_EDITOR: string;
		NODE_VERSION: string;
		HOSTNAME: string;
		GH_TOKEN: string;
		YARN_VERSION: string;
		ANTHROPIC_FOUNDRY_API_KEY: string;
		npm_node_execpath: string;
		GHOSTME_SSH_HOST_DIR: string;
		GHOSTME_WEB_DEV: string;
		SHLVL: string;
		npm_config_noproxy: string;
		PORT: string;
		HOME: string;
		OLDPWD: string;
		GH_REPO: string;
		npm_package_json: string;
		ANTHROPIC_DEFAULT_SONNET_MODEL: string;
		PUPPETEER_EXECUTABLE_PATH: string;
		GLITCHTIP_URL: string;
		CLAUDE_CODE_CHILD_SESSION: string;
		GHOSTME_HOOK_SOCKET: string;
		npm_config_userconfig: string;
		npm_config_local_prefix: string;
		USER_UID: string;
		GHOSTME_WEB_TOKEN: string;
		CLAUDE_CODE_USE_FOUNDRY: string;
		npm_config_engine_strict: string;
		GATEWAY_HOST: string;
		COLOR: string;
		CLAUDE_CONFIG_DIR: string;
		TMPDIR: string;
		GHOSTME_SESSION_ID: string;
		GH_HOST: string;
		GATEWAY_CA_NAME: string;
		GHOSTME_PROXY_SHIM_PUBLISH: string;
		_: string;
		npm_config_prefix: string;
		npm_config_npm_version: string;
		GHOSTME_SSH_AGENT_SOCK: string;
		GHOSTME_CLAUDE_DIR: string;
		npm_config_cache: string;
		GHOSTME_HOST_WORKSPACE: string;
		GATEWAY_PORT: string;
		ANTHROPIC_DEFAULT_OPUS_MODEL: string;
		PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: string;
		npm_config_node_gyp: string;
		PATH: string;
		GHOSTME_SSH_DIR: string;
		NEXT_TELEMETRY_DISABLED: string;
		NODE: string;
		npm_package_name: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		CLAUDE_EFFORT: string;
		DISABLE_ERROR_REPORTING: string;
		GHOSTME_CONTAINER: string;
		CLAUDE_PID: string;
		NoDefaultCurrentDirectoryInExePath: string;
		ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
		npm_lifecycle_script: string;
		GHOSTME_DATA_DIR: string;
		SHELL: string;
		npm_package_version: string;
		npm_lifecycle_event: string;
		GHOSTME_REMOTE_HOST_WORKSPACE: string;
		CLAUDE_CODE_SESSION_ID: string;
		CLAUDE_CODE_VERSION: string;
		HOST_WORKSPACE: string;
		CLAUDECODE: string;
		GLITCHTIP_CAN_RESOLVE: string;
		npm_config_globalconfig: string;
		npm_config_init_module: string;
		PWD: string;
		GLITCHTIP_PROJECTS: string;
		DISABLE_AUTOUPDATER: string;
		npm_execpath: string;
		GLITCHTIP_TOKEN: string;
		CLAUDE_CODE_EXECPATH: string;
		npm_config_global_prefix: string;
		GHOSTME_AGENT_RELAY: string;
		npm_command: string;
		USER_GID: string;
		HISTFILE: string;
		GHOSTME_PROXY_SHIM_URL: string;
		CHROME_BIN: string;
		NODE_ENV: string;
		PUPPETEER_SKIP_DOWNLOAD: string;
		GLITCHTIP_ORG: string;
		INIT_CWD: string;
		EDITOR: string;
		TEST: string;
		VITEST: string;
		PROD: string;
		DEV: string;
		BASE_URL: string;
		MODE: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	};
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 *
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 *
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 *
 * **_Public_ access:**
 *
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 *
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 *
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 *
 * For example, given the following runtime environment:
 *
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 *
 * With the default `publicPrefix` and `privatePrefix`:
 *
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 *
 * ```
 *
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	};
}
