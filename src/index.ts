/* eslint-disable no-underscore-dangle */
import type Command from './lib/baseCommand.js';
import type { CommandOptions } from './lib/baseCommand.js';
import type { CommandLineOptions } from 'command-line-args';

import chalk from 'chalk';
import cliArgs from 'command-line-args';
import parseArgsStringToArgv from 'string-argv';

import pkg from '../package.json' assert { type: 'json' };

import * as commands from './lib/commands.js';
import config from './lib/config.js';
import createGHA from './lib/createGHA/index.js';
import getCurrentConfig from './lib/getCurrentConfig.js';
import * as help from './lib/help.js';
import { debug } from './lib/logger.js';

const { version } = pkg;

/**
 * @param {Array} processArgv - An array of arguments from the current process. Can be used to mock
 *    fake CLI calls.
 * @return {Promise}
 */
export default function rdme(rawProcessArgv: NodeJS.Process['argv']) {
  const mainArgs = [
    { name: 'help', alias: 'h', type: Boolean, description: 'Display this usage guide' },
    {
      name: 'version',
      alias: 'v',
      type: Boolean,
      description: `Show the current ${config.cli} version (v${version})`,
    },
    { name: 'command', type: String, defaultOption: true },
  ];

  let processArgv = rawProcessArgv;

  debug(`raw process.argv: ${JSON.stringify(rawProcessArgv)}`);

  /**
   * We have a weird edge case with our Docker image version of `rdme` where GitHub Actions
   * will pass all of the `rdme` arguments as a single string with escaped quotes,
   * as opposed to the usual array of strings that we typically expect with `process.argv`.
   *
   * For example, say the user sends us `rdme openapi "petstore.json"`.
   * Instead of `process.argv` being this (i.e., when running the command via CLI):
   * ['openapi', 'petstore.json']
   *
   * The GitHub Actions runner will send this to the `rdme` Docker image:
   * ['openapi "petstore.json"']
   *
   * To distinguish these, we have a hidden `docker-gha` argument which we check for to indicate
   * when arguments are coming from the GitHub Actions runner.
   * This logic checks for that `docker-gha` argument and parses the second string
   * into the arguments array that `command-line-args` is expecting.
   */
  if (rawProcessArgv.length === 2 && rawProcessArgv[0] === 'docker-gha') {
    processArgv = parseArgsStringToArgv(rawProcessArgv[1]);
    debug(`parsing arg string into argv: ${JSON.stringify(processArgv)}`);
  }

  const argv = cliArgs(mainArgs, { partial: true, argv: processArgv });
  const cmd = argv.command || false;

  debug(`command-line-args processing: ${JSON.stringify(argv)}`);

  // Add support for `-V` as an additional `--version` alias.
  if (typeof argv._unknown !== 'undefined') {
    if (argv._unknown.indexOf('-V') !== -1) {
      argv.version = true;
    }
  }

  if (argv.version && (!cmd || cmd === 'help')) return Promise.resolve(version);

  let command = cmd || '';
  if (!command) {
    command = 'help';
  }

  if (command === 'help') {
    argv.help = true;
  }

  try {
    let cmdArgv: CommandOptions | CommandLineOptions;
    let bin: Command;

    // Handling for `rdme help` and `rdme help <command>` cases.
    if (command === 'help') {
      if ((argv._unknown || []).length === 0) {
        return Promise.resolve(help.globalUsage(mainArgs));
      }

      if (argv._unknown?.indexOf('-H') !== -1) {
        return Promise.resolve(help.globalUsage(mainArgs));
      }

      cmdArgv = cliArgs([{ name: 'subcommand', type: String, defaultOption: true }], {
        argv: argv._unknown,
      });
      if (!cmdArgv.subcommand) {
        return Promise.resolve(help.globalUsage(mainArgs));
      }

      bin = commands.load(cmdArgv.subcommand);
      return Promise.resolve(help.commandUsage(bin));
    }

    bin = commands.load(command);

    // Handling for `rdme <command> --help`.
    if (argv.help) {
      return Promise.resolve(help.commandUsage(bin));
    }

    try {
      cmdArgv = cliArgs(bin.args, { argv: argv._unknown || [] });
    } catch (e) {
      // If we have a command that has its own `--version` argument to accept data, that argument,
      // if supplied in the `--version VERSION_STRING` format instead of `--version=VERSION_STRING`,
      // will collide with the global version argument because their types differ and the argument
      // parser gets confused.
      //
      // Instead of failing out to the user with an undecipherable "Unknown value: ..." error, let's
      // try to parse their request again but a tad less eager.
      if (e.name !== 'UNKNOWN_VALUE' || (e.name === 'UNKNOWN_VALUE' && !argv.version)) {
        throw e;
      }

      cmdArgv = cliArgs(bin.args, { partial: true, argv: processArgv.slice(1) });
    }

    const { apiKey: key } = getCurrentConfig();

    cmdArgv = { key, ...cmdArgv };

    return bin.run(cmdArgv as CommandOptions).then((msg: string) => {
      if (bin.supportsGHA) {
        return createGHA(msg, bin.command, bin.args, cmdArgv as CommandOptions);
      }
      return msg;
    });
  } catch (e) {
    if (e.message === 'Command not found.') {
      e.message = `${e.message}\n\nType \`${chalk.yellow(`${config.cli} help`)}\` ${chalk.red('to see all commands')}`;
    }

    return Promise.reject(e);
  }
}
