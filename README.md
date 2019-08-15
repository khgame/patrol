# Patrol

Patrol is a handy tool, that allows you to easily schedule running of scripts or programs.
It supports both scheduled tasks and continuous work.

It also provides lot of built-in utilities, such as email notification and log management,
which can help you easily master various types of scheduled tasks.

# Table of Contents

* [Installation](#installation)
* [Quick Start](#quick-start)
    - [Configs](#configs)
        - [Configs Folders](#config-folders)
        - [Configs Files](#config-files)
        - [Batch Tasks](#batch-tasks)
* [Supported Tasks](#supported-tasks)
    - [Js scripts and node packages](#js-scripts-and-node-packages)
* [Other Operations](#other0operations)
    - [Check Status](#check-status)
    - [Restart](#restart)
    - [Logs](#logs)
    - [Clear Tasks](#clear-tasks)
* [Monitor APIs](#monitor-apis)

## Installation

- install with npm
    `npm i -g @khgame/patrol`

## Quick start

Once the package are installed, you can use `patrol start` command to start the tool.

In the directory where you currently in, some log files will be generated. Therefore, you may select a better place to start your patrol, such as `/var/patrol`.

You can also run `nohup patrol start &` to start patrol on background.

### Configs

In the above steps, you have started a patrol process, but there are no tasks have been executed yet.

This is because you haven't told patrol which tasks to perform, and what rules to execute.

Then let's start configuring some tasks.

#### Config Folders

There are two places where you can place the configuration of the task:

One is the directory where patrol is started, such as `/var/patrol` mentioned in the above example.

The other is `/etc/patrol/conf.d/`

e.p.

```bash
# ls -a /etc/patrol/conf.d/
ep-continuous.patrol.json
ep-scheduler.patrol.json
```

#### Config Files

As you can see, the configuration files are all json files with filenames ending in `.patrol.json`

The specific configuration of each file is as follows.

```json
# cat /etc/patrol/conf.d/ep-scheduler.patrol.json
{
  "script" : "./scripts/to/run.js",
  "rule": "*/10 * * * * *"
}
```

- script:

    The address of a `js script` or `node.js package`
    > Both relative and absolute addresses are supported.
    > When using relative addresses, it is recommended to put the relevant script or node project in the startup directory of patrol.

- rule:

    There are to rules are currently supported: `cron` and `continuous`

    1. cron:

        If you want to use the cron rule, just fill in the expression of cron directly in the rule.
        e.p. `"0 */10 * * * *"`

    2. continuous:

       If you want to use the continuous rule, fill in the rule directly with "continuous:" + sleep time after the end of each cycle.
       e.p. `"continuous:1000"`

Any changes of config file will be reloaded in a minute to reload the task, expect for the following two situations:

1. The task is running.

    If the task is running, the reload action will be performed after the task sleep.
    Therefore, it is best not to set the sleep time in continuous mode too short, in case the configuration cannot be reloaded.

2. The config file are removed.

    Obviously, in the case that the configuration file is deleted, the task will not be canceled. (This is especially important when modifying the configuration name)
    If you need to cancel the task, you can restart the patrol process.

When config file are reloaded, the related package will also be reloaded.

#### Batch Tasks

You can also config a batch of tasks in a config file.

```json
[
    {
      "script" : "./scripts/to/run.js",
      "rule": "continuous:60000"
    },
    {
      "script" : "./scripts/report/status.js",
      "rule": "0 */2 * * * *"
    }
]
```

## Supported tasks

### Js scripts and node packages

To create a script that can be scheduled by patrol, you just need to export a function named `patrol` in the script or the index file of the node project.

e.p.
```javascript
"using strict"

module.exports = {

    patrol: (log) => {
        log.info(Date.now())
    }
}
```

See more examples [here](./example).

## Other Operations

### Check Status

You can use `turtle ls -pi` command in the startup folder to check the state of patrol/

### Restart

You can use `turtle restart [-f] <process-name|process-pid>` command to restart the patrol process

### Logs

Based on the log specification of [`@khgame/turtle`](https://github.com/khgame/turtle), you can find the corresponding logs of each task in the `logs` directory under the patrol startup position.

If you have restart the process by `turtle restart`, you can use command `turtle log -pf` to follow the latest log.

### Clear tasks

For now, you can clear tasks which configs are removed by restart patrol

## Monitor APIs

- `/api/v1/core/health` : [GET] get health status of the patrol service.
- `/api/v1/panel/scheduler` : [GET] get status of all schedulers.


