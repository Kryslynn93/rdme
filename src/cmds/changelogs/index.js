const chalk = require('chalk');
const config = require('config');
const fs = require('fs');
const path = require('path');

const { debug } = require('../../lib/logger');
const pushDoc = require('../../lib/pushDoc');

module.exports = class ChangelogsCommand {
  constructor() {
    this.command = 'changelogs';
    this.usage = 'changelogs <folder> [options]';
    this.description = 'Sync a folder of Markdown files to your ReadMe project as Changelog posts.';
    this.category = 'changelogs';
    this.position = 1;

    this.hiddenArgs = ['folder'];
    this.args = [
      {
        name: 'key',
        type: String,
        description: 'Project API key',
      },
      {
        name: 'folder',
        type: String,
        defaultOption: true,
      },
      {
        name: 'dryRun',
        type: Boolean,
        description: 'Runs the command without creating/updating any changelogs in ReadMe. Useful for debugging.',
      },
    ];
  }

  async run(opts) {
    const { dryRun, folder, key } = opts;

    debug(`command: ${this.command}`);
    debug(`opts: ${JSON.stringify(opts)}`);

    if (!key) {
      return Promise.reject(new Error('No project API key provided. Please use `--key`.'));
    }

    if (!folder) {
      return Promise.reject(new Error(`No folder provided. Usage \`${config.get('cli')} ${this.usage}\`.`));
    }

    // Find the files to sync
    const readdirRecursive = folderToSearch => {
      const filesInFolder = fs.readdirSync(folderToSearch, { withFileTypes: true });
      const files = filesInFolder
        .filter(fileHandle => fileHandle.isFile())
        .map(fileHandle => path.join(folderToSearch, fileHandle.name));
      const folders = filesInFolder.filter(fileHandle => fileHandle.isDirectory());
      const subFiles = [].concat(
        ...folders.map(fileHandle => readdirRecursive(path.join(folderToSearch, fileHandle.name)))
      );
      return [...files, ...subFiles];
    };

    // Strip out non-markdown files
    const files = readdirRecursive(folder).filter(file => file.endsWith('.md') || file.endsWith('.markdown'));

    debug(`number of files: ${files.length}`);

    if (!files.length) {
      return Promise.reject(new Error(`We were unable to locate Markdown files in ${folder}.`));
    }

    const updatedDocs = await Promise.all(
      files.map(async filename => {
        return pushDoc(key, undefined, dryRun, filename, this.category);
      })
    );

    return chalk.green(updatedDocs.join('\n'));
  }
};
