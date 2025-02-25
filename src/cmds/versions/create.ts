import type { Version } from './index.js';
import type { AuthenticatedCommandOptions } from '../../lib/baseCommand.js';

import { Headers } from 'node-fetch';
import prompts from 'prompts';
import semver from 'semver';

import Command, { CommandCategories } from '../../lib/baseCommand.js';
import castStringOptToBool from '../../lib/castStringOptToBool.js';
import config from '../../lib/config.js';
import * as promptHandler from '../../lib/prompts.js';
import promptTerminal from '../../lib/promptWrapper.js';
import readmeAPIFetch, { cleanHeaders, handleRes } from '../../lib/readmeAPIFetch.js';

export interface Options extends CommonOptions {
  fork?: string;
}

export interface CommonOptions {
  beta?: 'true' | 'false';
  codename?: string;
  deprecated?: 'true' | 'false';
  hidden?: 'true' | 'false';
  main?: 'true' | 'false';
}

export default class CreateVersionCommand extends Command {
  constructor() {
    super();

    this.command = 'versions:create';
    this.usage = 'versions:create <version> [options]';
    this.description = 'Create a new version for your project.';
    this.cmdCategory = CommandCategories.VERSIONS;

    this.hiddenArgs = ['version'];
    this.args = [
      this.getKeyArg(),
      {
        name: 'fork',
        type: String,
        description: "The semantic version which you'd like to fork from.",
      },
      ...this.getVersionOpts(),
    ];
  }

  async run(opts: AuthenticatedCommandOptions<Options>) {
    await super.run(opts);

    let versionList;
    const { key, version, fork, codename, main, beta, deprecated, hidden } = opts;

    if (!version || !semver.valid(semver.coerce(version))) {
      return Promise.reject(
        new Error(`Please specify a semantic version. See \`${config.cli} help ${this.command}\` for help.`),
      );
    }

    if (!fork) {
      versionList = await readmeAPIFetch('/api/v1/version', {
        method: 'get',
        headers: cleanHeaders(key),
      }).then(handleRes);
    }

    prompts.override({
      from: fork,
      is_beta: castStringOptToBool(beta, 'beta'),
      is_deprecated: castStringOptToBool(deprecated, 'deprecated'),
      is_hidden: castStringOptToBool(hidden, 'hidden'),
      is_stable: castStringOptToBool(main, 'main'),
    });

    const promptResponse = await promptTerminal(promptHandler.versionPrompt(versionList || []));

    const body: Version = {
      codename,
      version,
      from: promptResponse.from,
      is_beta: promptResponse.is_beta,
      is_deprecated: promptResponse.is_deprecated,
      is_hidden: promptResponse.is_hidden,
      is_stable: promptResponse.is_stable,
    };

    return readmeAPIFetch('/api/v1/version', {
      method: 'post',
      headers: cleanHeaders(
        key,
        undefined,
        new Headers({ Accept: 'application/json', 'Content-Type': 'application/json' }),
      ),
      body: JSON.stringify(body),
    })
      .then(handleRes)
      .then(() => {
        return Promise.resolve(`Version ${version} created successfully.`);
      });
  }
}
