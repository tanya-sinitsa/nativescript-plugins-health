import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { ExecOptions } from "@actions/exec/lib/interfaces";

import { pluginsList } from "../../plugins-list";


interface PluginVersion {
  tested?: string;
  latest?: string;
}

interface TestResultItem {
  version?: string;
  [key: string]: string // { directory: test_result (+/-)
}


class CheckForPluginUpdatesAction {
  FILE_NAME_FOR_REPORT = '../PLUGINS_COMPATIBILITY.md';
  delimiter = ', ';
  options: ExecOptions = {};
  myError = '';
  testResult: { [key: string]: TestResultItem } = {};
  pluginsVersions: { [key: number]: PluginVersion } = {};
  workingDirectories: string[] = [];
  nativescriptVersions: string[] = [];
  isAndroid = false;


  async start() {
    let foundedNewVersion = false;

    try {
      this.nativescriptVersions = core.getInput('nativescript-versions').replace(/\s/g, '').split(',');
      this.workingDirectories = core.getInput('working-directories').replace(/\s/g, '').split(',');
      this.isAndroid = !!core.getInput('is-android');

      if (!this.workingDirectories || !this.workingDirectories.length) {
        core.setFailed('No projects to test!');
        return;
      }

      for (let i = 0; i < this.workingDirectories.length; i++) {
        if (!this.workingDirectories[i]) {
          return;
        }

        this.options.cwd = './' + this.workingDirectories[i];

        this.options.listeners = {
          stderr: (data) => {
            this.myError += '=install {N}=' + data.toString();
          }
        };

        await exec.exec(`npm uninstall -g nativescript`, [], this.options);
        await exec.exec(`npm install -g nativescript@${this.nativescriptVersions[i]} `, [], this.options);

        for (let i = 0; i < pluginsList.length; i++) {
          const pluginName = pluginsList[i];
          console.log('pluginName ====> ', pluginName);
          this.pluginsVersions[i] = {};

          this.options.listeners = {
            stdout: (data) => {
              const myOutput = data.toString().trim();
              const match = myOutput.match(/[0-9.]+/g) || [];
              this.pluginsVersions[i].tested = match[0];
            },
            stderr: (data) => {
              this.myError += '=grep tested=' + data.toString();
            }
          };
          // find the last tested version of the plugin in PLUGINS_COMPATIBILITY.md, where the test results are saved
          await exec.exec(`grep ${pluginName} ${this.FILE_NAME_FOR_REPORT}`, [], {
            ...this.options,
            ignoreReturnCode: true
          });


          this.options.listeners = {
            stdout: (data) => {
              const myOutput = data.toString().trim();
              const match = myOutput.match(/[0-9.]+$/g) || [];
              this.pluginsVersions[i].latest = match[0];
            },
            stderr: (data) => {
              this.myError += '=npm info=' + data.toString();
            }
          };

          await exec.exec(`npm info ${pluginName} version`, [], this.options);

          const testedVersion = this.pluginsVersions[i]?.tested;
          console.log('testedVersion ====>', testedVersion);
          const latestVersion = this.pluginsVersions[i]?.latest;
          console.log('latestVersion ====>', latestVersion);

          if (!latestVersion) {
            core.setFailed('Failed to get a plugin version for ' + pluginName + ' ! Check plugin name, please.');
            // todo: write to a log file
            return;
          }

          if (testedVersion !== latestVersion) {
            foundedNewVersion = true
          }
        }

        if (foundedNewVersion) {
          await this.updatePlugins(this.workingDirectories[i]);
        } else {
          console.log(`No updates for plugins!`);
          return;
        }
      }

      this.setOutput();

    } catch (error) {
      core.setFailed(error.message);
    }
  }


  async updatePlugins(workingDirectory: string) {
    for (let i = 0; i < pluginsList.length; i++) {
      const testedVersion = this.pluginsVersions[i].tested;
      const latestVersion = this.pluginsVersions[i].latest;
      let isSuccess = true;

      if (latestVersion && testedVersion !== latestVersion) {
        isSuccess = await this.testPlugin(pluginsList[i], latestVersion);
        await this.uninstallPlugin(pluginsList[i]);
      }

      if (!this.testResult[pluginsList[i]]) {
        this.testResult[pluginsList[i]] = {};
      }

      this.testResult[pluginsList[i]].version = latestVersion;
      this.testResult[pluginsList[i]][workingDirectory] = isSuccess ? '+' : '-';
    }
  }


  async testPlugin(pluginName, version) {
    let isSuccess = false;
    try {
      this.options.listeners = {
        stdout: (data) => {
          isSuccess = true;
        },
        stderr: (data) => {
          this.myError += '=npm install=' + data.toString();
          isSuccess = false;
        }
      };
      await exec.exec('npm install ' + pluginName + '@' + version + ' --save-exact', [], this.options);

      this.options.listeners = {
        stdout: (data) => {
          isSuccess = true;
        },
        stderr: (data) => {
          this.myError += '=tns build android=' + data.toString();
          isSuccess = false
        }
      };

      console.log('this.options ====>', this.options);
      await exec.exec(`tns build ${ this.isAndroid ? 'android' : 'ios'}`, [], this.options);

      return isSuccess;

    } catch (error) {
      core.setFailed(error.message);
      return false;
    }
  }


  async uninstallPlugin(pluginName) {
    this.options.listeners = {
      stderr: (data) => {
        this.myError += '=npm uninstall=' + data.toString();
      }
    };

    await exec.exec('npm uninstall ' + pluginName, [], this.options);
  }

  setOutput() {
    let output = '';

    for (const pluginName of pluginsList) {
      output += this.isAndroid ? pluginName + this.delimiter + this.testResult[pluginName].version + this.delimiter : '';

      for (const workingDirectory of this.workingDirectories) {
        output += this.testResult[pluginName][workingDirectory] + this.delimiter;
      }
      output = output.replace(/[,\s]+$/, ';');
      console.log('output =>', output);
    }

    core.setOutput('pluginsTestResult', output);
  }
}

(new CheckForPluginUpdatesAction()).start();
