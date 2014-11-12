var sh = require('shelljs');
var fs = require('fs');
var util = require('util');
var os = require('os');
var path = require('path');
var mkdirp = require('mkdirp');
var sqlite3 = require('sqlite3');


var validator = require('./ConfigValidator');
var setup = require('./ConfigSetup');

var EOL = os.EOL;

var DB_NAME = 'malware.db';

var FILE_EXT = '.bash';
var FILEFLAG = 'w';
var FILEMODE = '0777';
var REMOTE_DIR = '/tmp';

var FUNCHEADER =
    '#### %s ####' + EOL +
    '%s() {' + EOL;

var FUNCBODY_ACTION =
    'RETOUT=$(%s)' + EOL +
    'RETVAL=${?}' + EOL +
    'echo ${RETOUT}' + EOL +
    'return ${RETVAL}' + EOL +
    '}' + EOL + EOL;

var FUNCBODY_SCORE =
    'RETOUT=$(%s)' + EOL +
    'RETVAL=${?}' + EOL +
    'if [[ %s ]]; then' + EOL +
    '%s' + EOL +
    'fi' + EOL +
    '}' + EOL + EOL;

//(crontab -l ; echo "0 * * * * hupChannel.sh") 2>&1 | grep -v "no crontab" | sort | uniq | crontab -
//bin/bash -c 'echo "$0" "$1"' foo bar

var totalQueries = 0;
var queriesPerformed = 0;
var commands = {};

function getDataFromDB() {

    var dbpath = path.join(json['base_path'], DB_NAME);
    console.log('using db: ' + dbpath);
    var db = new sqlite3.Database(dbpath);

    // eval number of queries
    if (json.hasOwnProperty('event')) {
        json['event'].forEach(function (event) {
            if (event.hasOwnProperty('action')) {
                event['action'].forEach(function (action) {
                    if (validator.isNullOrEmpty(action['command'])) {
                        totalQueries++;
                    }
                    if (action.hasOwnProperty('score')) {
                        action['score'].forEach(function (score) {
                            if (validator.isNullOrEmpty(score['command'])) {
                                totalQueries++;
                            }
                        })
                    }
                });
            }
        });
    }

    console.log('db queries to be performed: ' + totalQueries);

    if (totalQueries == 0) {
        finalizeRun(commands);
    } else {
        if (json.hasOwnProperty('event')) {
            json['event'].forEach(function (event) {
                if (event.hasOwnProperty('action')) {
                    event['action'].forEach(function (action) {
                        if (validator.isNullOrEmpty(action['command'])) {
                            queryDB(db, action ['label'], 'malware', 'action');
                        }
                        if (action.hasOwnProperty('score')) {
                            action['score'].forEach(function (score) {
                                if (validator.isNullOrEmpty(score['command'])) {
                                    queryDB(db, score['label'], 'verification', 'verification_action');
                                }
                            })
                        }
                    });
                }
            });
        }
    }
}

function queryDB(db, label, table, field) {

    var query = util.format('select %s from %s where name = \'%s\';', field, table, label);
    console.log('db query: ' + query);

    db.all(query, function (err, rows) {

        if (err) {
            console.error('db query failed: ' + err);

            db.close();
            process.exit(1);
        }

        if (rows[0] == undefined) {
            console.error('cannot get images info for host/gateway' + label);
            db.close();
            process.exit(1);
        }


        console.log('db query returned : ' + rows[0][field]);
        commands[label] = rows[0][field];

        if (++queriesPerformed == totalQueries) {

            console.log('all DB queries done');
            db.close();
            // all queries done: continue with setup
            finalizeRun(commands);
        }
    });
}


var json;
function run(jsonData) {

    json = jsonData;

    getDataFromDB();

    return true;
}

function finalizeRun(dbData) {
    if (doRun(dbData)) {
        console.log('RUN succeeded');
    } else {
        process.exit(1);
    }
}

function doRun(dbData) {

    var status = true;

    if (json.hasOwnProperty('event')) {
        json['event'].every(function (event) {

            var now = new Date().getTime();
            if (!createActionFile(event, dbData, now)) {
                status = false;
            }

            var src = event['src'];
            var idx = src.indexOf('pnode ');
            if (idx != -1) {
                src = src.substring('pnode '.length);
            }

            // copy command file to remote location
            var cmd = util.format('scp %s root@%s:%s', filePath4Event(event, now), src, REMOTE_DIR);
            if (setup.exec(cmd) != 0) {
                status = false;
                return status;
            }

            // make file executable
            /*
             var remoteFile = path.join(REMOTE_DIR,fileName4Event(event));
             var cmd = util.format('ssh root@%s chmod +x %s',src, remoteFile);
             if (setup.exec(cmd) != 0) {
             status = false;
             return status;
             }
             */
            // create crontab entries
            if (event.hasOwnProperty('time')) {
                event['time'].every(function (time) {

                    var execTime = getExecTime(time);
                    if (execTime == undefined) {
                        status = false;
                        return status;
                    }
                    var cronCmd = path.join(REMOTE_DIR, fileName4Event(event, now));

                    var cronTabCmd = getCrontabEntryCmd(execTime, cronCmd);
                    var sshCmd = util.format('ssh root@%s \"%s\"', src, cronTabCmd);
                    if (setup.exec(sshCmd) != 0) {
                        status = false;
                    }

                    return status;
                });
            }

            return status;
        });
    }

    return status;
}

function eventPath() {
    return path.join(json['base_path'], json['event_path']);
}

function fileName4Event(event, ts) {
    return event['label'] + ts + FILE_EXT;
}

function filePath4Event(event, ts) {

    var fileName = path.join(eventPath(), fileName4Event(event, ts));

    return fileName;
}


function createActionFile(event, dbData, now) {

    var status = true;
    var pa = eventPath();
    var fileName = filePath4Event(event, now);

    var functionDefinitions =
        '#!/bin/bash' + EOL + EOL +
        '###################################' + EOL +
        '###### function definitions #######' + EOL +
        '###################################' + EOL + EOL;

    var functionCalls =
        '#############################' + EOL +
        '###### function calls #######' + EOL +
        '#############################' + EOL + EOL;

    if (event.hasOwnProperty('action')) {
        event['action'].forEach(function (action) {

            var funcName = action['label'];
            var command = action['command'];
            if (!command) {
                command = dbData[funcName];
            }
            var funcDef = util.format(FUNCHEADER, funcName, funcName);
            var funcCall = funcName;
            if (action.hasOwnProperty('options')) {
                var options = action['options'];
                var cnt = 1;
                for (var key in options) {

                    var opt = key.toUpperCase();
                    funcDef = funcDef + util.format('local %s=${%d}', opt, cnt) + EOL;
                    funcCall = funcCall + ' ' + options[key];
                    cnt++;
                }
            }
            funcDef = funcDef + util.format(FUNCBODY_ACTION, command);

            functionDefinitions = functionDefinitions + funcDef;
            functionCalls = functionCalls + funcCall + EOL + EOL;

            if (action.hasOwnProperty('score')) {
                action['score'].forEach(function (score) {

                    var funcName = score['label'];
                    var command = score['command'];
                    if (!command) {
                        command = dbData[funcName];
                    }
                    var funcDef = util.format(FUNCHEADER, funcName, funcName);
                    var funcCall = funcName;
                    if (score.hasOwnProperty('options')) {
                        var options = score['options'];
                        var cnt = 1;
                        for (var key in options) {

                            var opt = key.toUpperCase();
                            funcDef = funcDef + util.format('local %s=${%d}', opt, cnt) + EOL;
                            funcCall = funcCall + ' ' + options[key];
                            cnt++;
                        }
                    }
		    var mailcmd = util.format('echo \"team %s scores with %s\"', score['team'], score['weight']) + EOL;
                    //var mailcmd = 'echo \"bla\"';
                    funcDef = funcDef + util.format(FUNCBODY_SCORE, command, score['condition'], mailcmd);

                    functionDefinitions = functionDefinitions + funcDef;
                    functionCalls = functionCalls + funcCall + EOL + EOL;

                });
            }
        });


        var fd;
        try {
            mkdirp.sync(pa);
            fd = fs.openSync(fileName, FILEFLAG, FILEMODE);
            fs.writeSync(fd, functionDefinitions + functionCalls);

        } catch (ex) {

            console.error('failed to write file ' + fileName + ': ' + ex);
            status = false;

        } finally {

            if (fd) {
                fs.closeSync(fd);
            }
        }

    }

    return status;

    /*

     action label gibt funktionsname
     Funktionsdefinitionen
     add_ip {
     local DST=${1}
     local SPEED=${2}

     RETOUT=$(ip addr add)
     RETVAL=${RETOUT}
     echo ${RETOUT}
     return ${RETVAL}
     }

     dann Auftrufe

     add_ip cmm 100

     für score das gleiche
     team, condition, weight

     kein echo und return, sondern condition
     if  [[ condition ]]; then


     */

}

//
//
//
function getCrontabEntryCmd(execTime, cmd) {

    var cronTime = util.format('%s %s %s %s *', execTime.getMinutes(), execTime.getHours(), execTime.getDate(), (execTime.getMonth() + 1));

    return util.format('(crontab -l ; echo \'%s %s\') 2>&1 | grep -v \'no crontab\' | sort | uniq | crontab -', cronTime, cmd);
}

//
// Returns Date object with delta from current time.
//
// Return: Date object if successful, undefined otherwise
//
function getExecTime(delta) {

    // delta must match pattern <minutes>m<seconds>s

    var chars = ['h', 'm', 's'];

    var hours = 0;
    var minutes = 0;
    var seconds = 0;

    var idx0 = 0;
    var idx1 = 0;

    for (var i = 0; i < chars.length; i++) {
        idx1 = delta.indexOf(chars[i]);
        if (idx1 != -1) {
            var str = delta.substring(idx0, idx1);
            var val = parseInt(str);
            if (isNaN(val)) {
                console.log('invalid format of time: ' + delta);
                return undefined;
            }
            switch (chars[i]) {
                case 'h':
                    hours = val;
                    break;
                case 'm':
                    minutes = val;
                    break;
                case 's':
                    seconds = val;
                    break;
                default:
                    break;
            }

            idx0 = idx1 + 1;
        }
    }

    // got days, minutes and seconds, now add them to 'now'
    var now = new Date();
    var milliseconds = ((((hours * 60) + minutes) * 60) + seconds) * 1000;
    var execTime = new Date(now.getTime() + milliseconds);

    return execTime;
}


exports.run = run;

