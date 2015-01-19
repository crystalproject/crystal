var fs = require('fs');
var util = require('util');
var os = require('os');
var path = require('path');
var mkdirp = require('mkdirp');
var sqlite3 = require('sqlite3');


var utilities = require('./ConfigUtilities');
var validator = require('./ConfigValidator');

var EOL = os.EOL;

var DB_NAME = 'malware.db';

var FILE_EXT = '.bash';
var FILEFLAG = 'w';
var FILEMODE = '0777';
var REMOTE_DIR = '/tmp';

var BASH_SCRIPT_HEADER = '#!/bin/bash' + EOL + EOL;

var FUNCTION_DEFINITIONS_HEADER =
    '###################################' + EOL +
    '###### function definitions #######' + EOL +
    '###################################' + EOL + EOL;

var FUNCTION_CALLS_HEADER =
    '#############################' + EOL +
    '###### function calls #######' + EOL +
    '#############################' + EOL + EOL;


// template for function header in bash scripts
var FUNCTION_HEADER_TEMPLATE =
    '#### %s ####' + EOL +
    '%s() {' + EOL;

// template for function body for action function
var FUNCTION_BODY_ACTION_TEMPLATE =
    'RETOUT=$(%s)' + EOL +
    'RETVAL=${?}' + EOL +
    'echo ${RETOUT}' + EOL +
    'return ${RETVAL}' + EOL +
    '}' + EOL + EOL;

// template for function body for score function
var FUNCTION_BODY_SCORE_TEMPLATE =
    'RETOUT=$(%s)' + EOL +
    'RETVAL=${?}' + EOL +
    'if [[ %s ]]; then' + EOL +
    '%s' + EOL +
    'fi' + EOL +
    '}' + EOL + EOL;


//
// Fetches date from the malware and verification table.
// The db queries are done asynchronously. when all queries are
// done (and the requested data is stored) the script continues
// synchronously.
//
//
function getDataFromDB() {

    var dbpath = path.join(json.base_path, DB_NAME);
    console.log('using db: ' + dbpath);
    var db = new sqlite3.Database(dbpath);
    var dbData = {dbCommands: {}, totalQueries: 0, queriesCounter: 0};

    // eval number of queries which have to be done.
    // this is the number of actions and scores which have no command set.
    if (json.hasOwnProperty('event')) {
        json.event.forEach(function (event) {
            if (event.hasOwnProperty('action')) {
                event.action.forEach(function (action) {
                    if (utilities.isNullOrEmpty(action.command)) {
                        dbData.totalQueries++;
                    }
                    if (action.hasOwnProperty('score')) {
                        action.score.forEach(function (score) {
                            if (utilities.isNullOrEmpty(score.command)) {
                                dbData.totalQueries++;
                            }
                        })
                    }
                });
            }
        });
    }

    console.log('db queries to be performed: ' + dbData.totalQueries);

    // now execute the db queries (asynchronosly)
    if (dbData.totalQueries == 0) {
        runSync(dbData.dbCommands);
    } else {
        if (json.hasOwnProperty('event')) {
            json.event.forEach(function (event) {
                if (event.hasOwnProperty('action')) {
                    event.action.forEach(function (action) {
                        if (utilities.isNullOrEmpty(action.command)) {
                            // action: query malware table
                            queryDB(db, dbData, action.label, 'malware', 'action');
                        }
                        if (action.hasOwnProperty('score')) {
                            action.score.forEach(function (score) {
                                if (utilities.isNullOrEmpty(score.command)) {
                                    // score: query verification table
                                    queryDB(db, dbData, score.label, 'verification', 'verification_action');
                                }
                            })
                        }
                    });
                }
            });
        }
    }
}

//
// Performs a db query. The query is asynchronous. If all queries
// are finished the script continues to run synchronously.
//
//
function queryDB(db, dbData, label, table, field) {

    var query = util.format('select %s from %s where name = \'%s\';', field, table, label);
    console.log('db query: ' + query);

    db.all(query, function (err, rows) {

        if (err) {
            console.error('db query failed: ' + err);

            db.close();
            process.exit(1);
        }

        if (rows[0] == undefined) {
            console.error('cannot get ' + field + ' for ' + label + ' from table ' + table);
            db.close();
            process.exit(1);
        }


        console.log('db query returned : ' + rows[0][field]);
        dbData.dbCommands[label] = rows[0][field];

        if (++dbData.queriesCounter == dbData.totalQueries) {

            console.log('all DB queries done');
            db.close();
            // all queries done: continue with script
            runSync(dbData.dbCommands);
        }
    });
}


var json;
function doRun(jsonData) {

    json = jsonData;

    getDataFromDB();

    return true;
}

//
// executes the RUN mode operations. Is called when
// all db queries have finished.
//
//
function runSync(dbCommands) {
    if (performRun(dbCommands)) {
        console.log('RUN succeeded');
    } else {
        process.exit(1);
    }
}

function performRun(dbCommands) {
	console.log('perform run executed');

    var status = true;

    if (json.hasOwnProperty('event')) {
        json.event.every(function (event) {

            // create the  bash script
            var now = new Date().getTime();

            if (!createCommandScript(event, dbCommands, now)) {
                status = false;
            }

            var src = event.src;
            var idx = src.indexOf('pnode ');
            if (idx != -1) {
                src = src.substring('pnode '.length);
            }

            idx = src.indexOf('ssh ');
            if (idx != -1){
              src = src.substring('ssh '.length);
              if(event.hasOwnProperty('password') && event.hasOwnProperty('user')){
                if (json.hasOwnProperty('segment')) {
                    var found = false;
              			var intermediate_host, ovswitch, segment;
                    json.segment.forEach(function (seg) {
                      if(found){ return; }
                      if (utilities.isIpInRange(src, seg.net)) {
                        intermediate_host = seg.pnode[0];
                  			console.log('intermediate host is: ', intermediate_host);
                        ovswitch = seg.ovswitch;
                  			segment = seg;
                        found = true;
                      }
                    });
                    if(found && intermediate_host.length > 0){

              			console.log("copy via intermediate host");
                    
                    // grab used ips
			              var ipAddresses = validator.validateIpAddresses();

                   // make sure intermediate host can reach the network
                   var netmask = utilities.getBitmaskFromCidr(segment.net);
                   var randomIp = utilities.getUnusedIpAddressInRange(segment.net, ipAddresses);
                   if (!randomIp) {
                    console.error('could not obtain unused ip address in ' + segment.net);
                    status = false;
                    return false;
                  }

                  var cmd = util.format('ssh root@%s ip addr add %s/%s dev %s', intermediate_host, randomIp, netmask, ovswitch);
                  if (utilities.exec(cmd) != 0) {
                    status = false;
                    return false;
                  } else {
                    console.log('shelljs command succeeded');
                  }


                   // copy bash script to destination via intermediate host
                   var cmd = util.format('cat < %s | ssh root@%s "sshpass -p \"%s\" ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no %s@%s \\"cd \"%s\" && cat > \"%s\";chmod 755 %s/%s\\""', filePath4Event(event, now), intermediate_host, event.password, event.user, src, REMOTE_DIR, fileName4Event(event, now), REMOTE_DIR, fileName4Event(event, now));
                   if (utilities.exec(cmd) != 0) {
                       status = false;
                      return status;
                   }

                    }
                  }
                }
            } else {

            // copy script to remote location
            var cmd = util.format('scp %s root@%s:%s', filePath4Event(event, now), src, REMOTE_DIR);
            if (utilities.exec(cmd) != 0) {
                status = false;
                return status;
            }
            }

            // create crontab entries
            if (event.hasOwnProperty('time')) {
                event.time.every(function (time) {

                    var execTime = getExecTimeFromDelta(time);
                    if (!execTime) {
                        status = false;
                        return status;
                    }
                    var cronCmd = path.join(REMOTE_DIR, fileName4Event(event, now));

                    var cronTabCmd = getCrontabEntryCmd(execTime, cronCmd);
                    if (idx != -1) {
                      var sshCmd = util.format('ssh root@%s \"sshpass -p \"%s\" ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no %s@%s \\"%s\\"\"', intermediate_host, event.password, event.user, src, cronTabCmd);
                    } else {
                      var sshCmd = util.format('ssh root@%s \"%s\"', src, cronTabCmd);
                    }
                    if (utilities.exec(sshCmd) != 0) {
                        status = false;
                    }
              		if (src.indexOf('ssh ') != -1) {
                    var cmd = util.format('ssh root@%s ip addr del %s/%s dev %s', intermediate_host, randomIp, netmask, ovswitch);
                    if (utilities.exec(cmd) != 0) {
                      status = false;
                      return false;
                    } else {
                      console.log('shelljs command succeeded');
                    }
                  }

                    return status;
                });
            }

            if (!status) {
                return status;
            }

            if (event.hasOwnProperty('absoluteTime')) {
                event.absoluteTime.every(function (time) {

                    var execTime = validator.validateEventAbsoluteTime(time);
                    if (!execTime) {
                        status = false;
                        return status;
                    }
                    var cronCmd = path.join(REMOTE_DIR, fileName4Event(event, now));
                    var cronTabCmd = getCrontabEntryCmd(execTime, cronCmd);
                    if (src.indexOf('ssh ') != -1 ) {
                      var sshCmd = util.format('ssh root@%s \"sshpass -p \"%s\" ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no %s@%s \\"%s\\"\"', intermediate_host, event.password, event.user, src, cronTabCmd);
                    } else {
                      var sshCmd = util.format('ssh root@%s \"%s\"', src, cronTabCmd);
                    }
                    if (utilities.exec(sshCmd) != 0) {
                        status = false;
                    }
                  var cmd = util.format('ssh root@%s ip addr del %s/%s dev %s', intermediate_host, randomIp, netmask, ovswitch);
                  if (utilities.exec(cmd) != 0) {
                    status = false;
                    return false;
                  } else {
                    console.log('shelljs command succeeded');
                  }

                    return status;
                });
            }

            return status;
        });
    }

    return status;
}

//
// Returns the events directory path.
//
function eventPath() {
    return path.join(json.base_path, json.event_path);
}

//
// Returns the bash script file name for the event.
// the file name contains a timestamp to avoid overwriting of script files.
//
function fileName4Event(event, ts) {
    return event.label + ts + FILE_EXT;
}

//
// Returns the file path of the bash script file.
//
function filePath4Event(event, ts) {

    return path.join(eventPath(), fileName4Event(event, ts));
}


//
// Creates the bash script with the commands for the actions and scores.
//
//
function createCommandScript(event, dbCommands, now) {

    var status = true;

    var pa = eventPath();
    var fileName = filePath4Event(event, now);

    var functionDefinitions = BASH_SCRIPT_HEADER + FUNCTION_DEFINITIONS_HEADER;

    var functionCalls = FUNCTION_CALLS_HEADER;

    if (event.hasOwnProperty('action')) {
        event.action.every(function (action) {

            // action's label becomes the function name
            var funcName = action.label;
            var command = action.command;
            if (!command) {
                // if command is not set, the command is defined by the DB
                command = dbCommands[funcName];
                if (!command) {
                    console.error('did not find command for ' + funcName + ' in DB');
                    status = false;
                    return status;
                }
            }
            // setup function header
            var funcDef = util.format(FUNCTION_HEADER_TEMPLATE, funcName, funcName);
            // setup function call part
            var funcCall = funcName;
            // iterate over options, each option is integrated in the function body
            // and the function call
            if (action.hasOwnProperty('options')) {
                var options = action.options;
                var cnt = 1;
                for (var key in options) {

                    var opt = key.toUpperCase();
                    funcDef = funcDef + util.format('local %s=${%d}', opt, cnt) + EOL;
                    funcCall = funcCall + ' ' + options[key];
                    cnt++;
                }
            }
            // finalize function body
            funcDef = funcDef + util.format(FUNCTION_BODY_ACTION_TEMPLATE, command);

            // add new function definition to the already existing functions
            functionDefinitions = functionDefinitions + funcDef;
            // add new function call to the already existing function calls
            functionCalls = functionCalls + funcCall + EOL + EOL;

            // handle scores
            if (action.hasOwnProperty('score')) {
                action.score.every(function (score) {

                    // score's label becomes the function name
                    var funcName = score.label;
                    var command = score.command;
                    if (!command) {
                        // if command is not set, the command is defined by the DB
                        command = dbCommands[funcName];
                        if (!command) {
                            console.error('did not find command for ' + funcName + ' in DB');
                            status = false;
                            return status;
                        }
                    }
                    var funcDef = util.format(FUNCTION_HEADER_TEMPLATE, funcName, funcName);
                    var funcCall = funcName;
                    if (score.hasOwnProperty('options')) {
                        var options = score.options;
                        var cnt = 1;
                        for (var key in options) {

                            var opt = key.toUpperCase();
                            funcDef = funcDef + util.format('local %s=${%d}', opt, cnt) + EOL;
                            funcCall = funcCall + ' ' + options[key];
                            cnt++;
                        }
                    }

                    // todo: team is an array. is below mailcmd correct?
                    //var mailcmd = util.format('echo \"team %s scores with %s\"', score.team, score.weight) + EOL;

                        //get email addresses
                     var addrcmd = util.format('/usr/local/sbin/mgmt_dashboard.sh getemails');
                     var returnobj = utilities.execRet(addrcmd)
                     if (returnobj.code != 0) {
                      status = false;
                      return false;
                      }
                     var emails = returnobj.output.split(",");
                     var mailout = "";

                     emails.forEach(function(email){
                       mailout = mailout + "echo \"rcpt to: " + email + "\";"
                     });

                     var ipcmd = util.format('ip -4 -o addr | grep service-net |awk \'!/^[0-9]*: ?lo|link\\/ether/ {gsub(\"/\", \" \"); print $4}\'');
                     var ipret = utilities.execRet(ipcmd);

                     if (ipret.code != 0) {
                         status = false;
                         return status;
                     }
                    var ctrl_ip = ipret.output;
              			ctrl_ip = utilities.removeEOL(ctrl_ip);

                     var mailcmd = util.format("{ sleep 5; echo \"ehlo monitor.crystal\"; sleep 3; echo \"mail from: monitor\"; "+mailout+" echo \"DATA\" ; sleep 3; echo -e \"Subject: team %s scores with %s\"; echo; echo; echo; echo .;echo; } | telnet %s 25", score.team, score.weight, ctrl_ip);


                    funcDef = funcDef + util.format(FUNCTION_BODY_SCORE_TEMPLATE, command, score.condition, mailcmd);

                    // add new score function to the already existing function definitions and function calls.
                    functionDefinitions = functionDefinitions + funcDef;
                    functionCalls = functionCalls + funcCall + EOL + EOL;

                    return status;
                });
            }

            return status;
        });

        if (!status) {
            return status;
        }

        var fd;
        try {
            mkdirp.sync(pa);
            fd = fs.openSync(fileName, FILEFLAG, FILEMODE);
            // write file:
            // 1st the function bodies, 2nd the function calls to have a nice looking bash script
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
}

//
// Returns the command to add a crontab entry to run 'cmd' at 'execTime'
// and executes cmd.
//
//
function getCrontabEntryCmd(execTime, cmd) {

    var cronTime = util.format('%s %s %s %s *', execTime.getMinutes(), execTime.getHours(), execTime.getDate(), (execTime.getMonth() + 1));

    return util.format('(crontab -l ; echo \'%s %s\') 2>&1 | grep -v \'no crontab\' | sort | uniq | crontab -', cronTime, cmd);
}

//
// Returns Date object with delta from current time.
//
// Return: Date object if successful, null otherwise
//
function getExecTimeFromDelta(delta) {


    var time = validator.validateEventRelativeTime(delta);
    if (!time) {
        return null;
    }

    // got days, minutes and seconds, now add them to 'now'
    var now = new Date();
    var milliseconds = ((((time.hours * 60) + time.minutes) * 60) + time.seconds) * 1000;

    return new Date(now.getTime() + milliseconds);
}


exports.doRun = doRun;

