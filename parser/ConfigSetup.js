var util = require('util');
var path = require('path');
var os = require('os');
var fs = require('fs');
var mkdirp = require('mkdirp');
var sqlite3 = require('sqlite3');
var sleep = require('sleep');
var async = require('async');
var xmlrpc = require('xmlrpc');
var xmlParser = require('xml2json');
var readline = require('readline-sync');


var utilities = require('./ConfigUtilities');
var validator = require('./ConfigValidator');
var stage = require('./ConfigStage');
var cleanup = require('./ConfigCleanup');


var EOL = os.EOL;
var WINEOL = '\r\n';
var FILEFLAG = 'w';

var OPENNEBULA_HOST;
if (utilities.TEST_MODE) {
    OPENNEBULA_HOST = 'node01';
} else {
    OPENNEBULA_HOST = 'localhost';
}

var OPENNEBULA_RPC_PORT = 2633;
var OPENNEBULA_RPC_PATH = '/RPC2';

var DB_NAME = 'malware.db';


var WINDOWS_TEMPLATE =
    'SET LANCON=%s' + WINEOL +
    'SET SRVROLE=%s' + WINEOL +
    'SET IPADDR=%s' + WINEOL +
    'SET NETMASK=%s' + WINEOL +
    'SET GATEWAY=%s' + WINEOL +
    'SET DNSPRI=%s' + WINEOL +
    'SET DNSSEC=%s' + WINEOL;


var UBUNTU_TEPMLATE =
    '# The primary network interface' + EOL +
    'auto eth%s' + EOL +
    'iface eth%s inet static' + EOL +
    'address %s' + EOL +
    'netmask %s' + EOL;

var UBUNTU_GATEWAY_TEMPLATE = 'gateway %s' + EOL;
var UBUNTU_DNS_TEMPLATE = 'dns-nameservers %s %s' + EOL;

var GW_IPTABLES_TEMPLATE =
    'iptables -A PREROUTING -t nat -i eth1 -p tcp --dport %s -j DNAT --to %s:%s ' + EOL +
    'iptables -A FORWARD -p tcp -d %s --dport %s -j ACCEPT' + EOL;

var ONEIMAGE_CREATE_ATTRIBUTES =
    'PERSISTENT=%s' + EOL +
    'NAME=\"%s\"' + EOL +
    'PATH=%s' + EOL +
    'PREFIX=%s' + EOL +
    'TYPE=%s' + EOL +
    'DRIVER=%s' + EOL;

// opennebula vm states
var VM_STATE = {
    INIT: 0,
    PENDING: 1,
    HOLD: 2,
    ACTIVE: 3,
    STOPPED: 4,
    SUSPENDED: 5,
    DONE: 6,
    FAILED: 7,
    POWEROFF: 8,
    UNDEPLOYED: 9
};

// opennebula image states
var IMAGE_STATE = {
    INIT: 0,
    READY: 1,
    USED: 2,
    DISABLED: 3,
    LOCKED: 4,
    ERROR: 5,
    CLONE: 6,
    DELETE: 7,
    USED_PERS: 8
};

var ipAddresses;
var oneimagesInfo = {};
var onehostsInfo = {};
var onevmsInfo = {};
var onevnetsInfo = {};
var createdBridges = [];
var createdVnets = [];
var createdImages = [];
var createdVms = [];

var sessionString;

function printImageState(state) {
    switch (state) {
        case IMAGE_STATE.INIT:
            return 'INIT';
        case IMAGE_STATE.READY:
            return 'READY';
        case IMAGE_STATE.USED:
            return 'USED';
        case IMAGE_STATE.DISABLED:
            return 'DISABLED';
        case IMAGE_STATE.LOCKED:
            return 'LOCKED';
        case IMAGE_STATE.ERROR:
            return 'ERROR';
        case IMAGE_STATE.CLONE:
            return 'CLONE';
        case IMAGE_STATE.DELETE:
            return 'DELETE';
        case IMAGE_STATE.USED_PERS:
            return 'USED_PERS';
        default:
            return 'unknown';
    }
}

function printVmState(state) {
    switch (state) {
        case VM_STATE.INIT:
            return 'INIT';
        case VM_STATE.PENDING:
            return 'PENDING';
        case VM_STATE.HOLD:
            return 'HOLD';
        case VM_STATE.ACTIVE:
            return 'ACTIVE';
        case VM_STATE.STOPPED:
            return 'STOPPED';
        case VM_STATE.SUSPENDED:
            return 'SUSPENDED';
        case VM_STATE.DONE:
            return 'DONE';
        case VM_STATE.FAILED:
            return 'FAILED';
        case VM_STATE.POWEROFF:
            return 'POWEROFF';
        case VM_STATE.UNDEPLOYED:
            return 'UNDEPLOYED';
        default:
            return 'unknown';
    }
}

//
// Gets image information for all hosts and gateways from the DB.
// this is an asynchronous operation. When all queries are done
// the setup procedure continues.
//
//
function getDataFromDB(json, oneAuthPath) {

    var dbpath = path.join(json.base_path, DB_NAME);
    console.log('using db: ' + dbpath);
    var db = new sqlite3.Database(dbpath);

    var dbData = {imagesData: {}, totalQueries: 0, queriesCounter: 0};


    // eval number of hosts and gateways (for each of them a db query must be performed)
    if (json.hasOwnProperty('segment')) {
        json.segment.forEach(function (segment) {
            if (segment.hasOwnProperty('host')) {
                segment.host.forEach(function () {
                    dbData.totalQueries++;
                });
            }
            if (segment.hasOwnProperty('gateway')) {
                segment.gateway.forEach(function () {
                    dbData.totalQueries++;
                });
            }
        });
    }

    console.log('db queries to be performed: ' + dbData.totalQueries);

    if (json.hasOwnProperty('segment')) {
        json.segment.forEach(function (segment) {
            if (segment.hasOwnProperty('host')) {
                segment.host.forEach(function (host) {

                    queryDB(json, oneAuthPath, db, dbData, host.label, host.os, host['major patch']);

                });
            }

            if (segment.hasOwnProperty('gateway')) {
                segment.gateway.forEach(function (gateway) {

                    queryDB(json, oneAuthPath, db, dbData, gateway.label, gateway.os, gateway['major patch']);

                });
            }

        });
    }
}


//
//
//
function queryDB(json, oneAuthPath, db, dbData, label, os, major_patch) {

    var mp;
    if (major_patch === 'none') {
        mp = "os.major_patch IS NULL";
    } else {
        mp = "os.major_patch = \'" + major_patch + "\'";
    }
    var query = util.format('select os.image_name, os.root_partition_id, os.vg_lv from os inner join architecture on architecture.id ' +
    '== os.fk_architecture_id where os.name = \'%s\' and ' + mp + ';', os);


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


        //console.log('db query returned image_name: ' + rows[0].image_name + ', ' + rows[0].root_partition_id + ', ' + rows[0].vg_lv);
        dbData.imagesData[label] = rows[0];

        if (++dbData.queriesCounter == dbData.totalQueries) {

            console.log('all DB queries done');
            db.close();
            // all queries done: continue with setup
            performSetup(json, oneAuthPath, dbData.imagesData);
        }
    });
}

//
//
//
//
function doSetup(jsonData, oneAuthPath) {
    // need to increase the number of file descriptors due to shelljs
    if (!utilities.TEST_MODE) {
        if (utilities.exec("ulimit -n 20000") != 0) {
            return false;
        } else {
            console.log('shelljs command succeeded');
        }
    }
    getDataFromDB(jsonData, oneAuthPath);

    return true;
}

// async function:
//
// Creates bridge
//
// asyncParam: object with attributes: bridge, pnode
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function createBridgeAsync(asyncParam, callback) {

    var err = null;
    var bridge = asyncParam.bridge;
    var pnode = asyncParam.pnode;

    console.log('async: create bridge ' + bridge + ' on pnode ' + pnode);

    var cmd = util.format('ssh root@%s ovs-vsctl --may-exist add-br \'%s\'', pnode, bridge);
    if (utilities.exec(cmd) != 0) {
        err = true;
    } else {
        // call succeeded
        console.log('async: shelljs command succeeded');
        createdBridges.push({pnode: pnode, bridge: bridge});
    }

    callback(err, null);
}

// async function:
//
// adds custom interface to bridge
//
// asyncParam: object with attributes: bridge, pnode, phydev
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function addPhyDevAsync(asyncParam, callback) {
    var err = null;
    var bridge = asyncParam.bridge;
    var pnode = asyncParam.phydev.pnode;
    var phydev = asyncParam.phydev.dev;

    console.log('async: add phydev ' + phydev + ' to bridge ' + bridge + ' on pnode ' + pnode);

    var cmd = util.format('ssh root@%s ip link set \'%s\' up', pnode, phydev);

    if (utilities.exec(cmd) != 0) {
        err = true;
        callback(err, null);
        return;
    } else {
        console.log('async: shelljs ip link up succeeded');
    }

    var cmd = util.format('ssh root@%s ovs-vsctl --may-exist add-port \'%s\' \'%s\'', pnode, bridge, phydev);

    if (utilities.exec(cmd) != 0) {
        err = true;
    } else {
        console.log('async: shelljs phydev succeeded');
    }

    callback(err, null);
}


// async function:
//
// Creates vnet
//
// asyncParam: object with attributes: json,rpcClient,vnet
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function oneVnetCreateAsync(asyncParam, callback) {

    var err = null;
    var json = asyncParam.json;
    var rpcClient = asyncParam.rpcClient;
    var vnet = asyncParam.vnet;

    console.log('async: create onevnet ' + vnet);

    if (onevnetsInfo[vnet]) {
        // vnet already exists: do nothing
        console.log('async: onevnet already exists: ' + vnet);
        callback(err, null);
        return;
    }


    var fileName = path.join(json.output_path, vnet + stage.ONEVNET_EXT);
    var template = utilities.readFile(fileName);
    if (template == null) {
        err = true;
        callback(err, null);
        return;
    }

    var methodName = 'one.vn.allocate';
    var rpcParam = [getSessionString(), template, -1];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');
        createdVnets.push({name: vnet, id: value[1]});

        callback(err, null);
    });
    /*
     var cmd = util.format('su -c \"onevnet create \'%s\'\" oneadmin', onevnetName);
     if (utilities.exec(cmd) != 0) {
     err = true;
     }
     */
}

// async function:
//
// Fetches information of existing images from opennebula
//
// asyncParam: object with attributes: rpcClient
// callback on success: err = null,
//                      param: object with attribute: imagesInfo
//          on failure: err = true,
//                      param: null
//
function getImagesInfo(asyncParam, callback) {

    console.log('async: fetching images data');
    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var methodName = 'one.imagepool.info';
    var rpcParam = [getSessionString(), -2, -1, -1];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        var imagePoolInfo;
        try {
            var json = xmlParser.toJson(value[1]);
            imagePoolInfo = JSON.parse(json);
        } catch (e) {
            console.error('async: failed to convert/parse imagepool info: ' + e);
            err = true;
            callback(err, null);
            return;
        }

        var imagesInfo = {};
        console.log('*********** IMAGEs **************');
        if (imagePoolInfo.hasOwnProperty('IMAGE_POOL')) {
            var imagePool = imagePoolInfo.IMAGE_POOL;
            if (imagePool.hasOwnProperty('IMAGE')) {
                if (Array.isArray(imagePool.IMAGE)) {
                    imagePool.IMAGE.forEach(function (image) {
                        imagesInfo[image.NAME] = {id: image.ID, state: image.STATE, source: image.SOURCE};
                        console.log('id: ' + image.ID + ', name: ' + image.NAME + ', state: ' + printImageState(image.STATE) + ', source: ' + image.SOURCE);
                    });
                } else {
                    var image = imagePool.IMAGE;
                    imagesInfo[image.NAME] = {id: image.ID, state: image.STATE, source: image.SOURCE};
                    console.log('id: ' + image.ID + ', name: ' + image.NAME + ', state: ' + printImageState(image.STATE) + ', source: ' + image.SOURCE);

                }
            }
        }
        console.log('*********************************');

        callback(err, {imagesInfo: imagesInfo});
    });
}

// async function:
//
// Stores information about images to global variable
//
// asyncParam: object with attribute: imagesInfo
// callback err = null,
//         param: null
//
function storeImagesInfo(asyncParam, callback) {
    console.log('async: storing images data');
    oneimagesInfo = asyncParam.imagesInfo;
    var err = null;
    callback(err, null);
}

// async function:
//
// Fetches information of existing hosts from opennebula
//
// asyncParam: object with attributes: rpcClient
// callback on success: err = null,
//                      param: object with attribute: hostsInfo
//          on failure: err = true,
//                      param: null
//
function getHostsInfo(asyncParam, callback) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var methodName = 'one.hostpool.info';
    var rpcParam = [getSessionString()];

    console.log('async: fetching hosts data');

    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        var hostPoolInfo;
        try {
            var json = xmlParser.toJson(value[1]);
            hostPoolInfo = JSON.parse(json);
        } catch (e) {
            console.error('async: failed to convert/parse hostpool info: ' + e);
            err = true;
            callback(err, null);
            return;
        }

        var hostsInfo = {};
        console.log('*********** HOSTs **************');

        if (hostPoolInfo.hasOwnProperty('HOST_POOL')) {
            var hostPool = hostPoolInfo.HOST_POOL;
            if (hostPool.hasOwnProperty('HOST')) {
                if (Array.isArray(hostPool.HOST)) {
                    hostPool.HOST.forEach(function (host) {
                        hostsInfo[host.NAME] = {id: host.ID};
                        console.log('id: ' + host.ID + ', name: ' + host.NAME);
                    });
                } else {
                    var host = hostPool.HOST;
                    hostsInfo[host.NAME] = {id: host.ID};
                    console.log('id: ' + host.ID + ', name: ' + host.NAME);

                }
            }
        }
        console.log('********************************');

        callback(err, {hostsInfo: hostsInfo});
    });
}

// async function:
//
// Stores information about hosts to global variable
//
// asyncParam: object with attribute: hostsInfo
// callback err = null,
//         param: null
//
function storeHostsInfo(asyncParam, callback) {
    console.log('async: storing hosts data');
    onehostsInfo = asyncParam.hostsInfo;
    var err = null;
    callback(err, null);
}

// async function:
//
// Fetches information of existing vms from opennebula
//
// asyncParam: object with attributes: rpcClient
// callback on success: err = null,
//                      param: object with attribute: vmsInfo
//          on failure: err = true,
//                      param: null
//
function getVmsInfo(asyncParam, callback) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var methodName = 'one.vmpool.info';
    var rpcParam = [getSessionString(), -2, -1, -1, -2];

    console.log('async: fetching vms data');

    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        var vmPoolInfo;
        try {
            var json = xmlParser.toJson(value[1]);
            vmPoolInfo = JSON.parse(json);
        } catch (e) {
            console.error('async: failed to convert/parse vmpool info: ' + e);
            err = true;
            callback(err, null);
            return;
        }

        var vmsInfo = {};
        console.log('*********** VMs **************');

        if (vmPoolInfo.hasOwnProperty('VM_POOL')) {
            var vmPool = vmPoolInfo.VM_POOL;
            if (vmPool.hasOwnProperty('VM')) {
                if (Array.isArray(vmPool.VM)) {
                    vmPool.VM.forEach(function (vm) {
                        // we're  only interested in vms which are not in state DONE (vm deleted but kept in db).
                        if (vm.STATE != VM_STATE.DONE) {
                            vmsInfo[vm.NAME] = {id: vm.ID, state: vm.STATE};
                            console.log('id: ' + vm.ID + ', name: ' + vm.NAME + ', state: ' + printVmState(vm.STATE));
                        }
                    });
                } else {
                    var vm = vmPool.VM;
                    // we're  only interested in vms which are not in state DONE (vm deleted but kept in db).
                    if (vm.STATE != VM_STATE.DONE) {
                        vmsInfo[vm.NAME] = {id: vm.ID, state: vm.STATE};
                        console.log('id: ' + vm.ID + ', name: ' + vm.NAME + ', state: ' + printVmState(vm.STATE));
                    }
                }
            }
        }
        console.log('******************************');

        callback(err, {vmsInfo: vmsInfo});
    });
}

// async function:
//
// Stores information about vms to global variable
//
// asyncParam: object with attribute: vmsInfo
// callback err = null,
//         param: null
//
function storeVmsInfo(asyncParam, callback) {
    console.log('async: storing vms data');
    onevmsInfo = asyncParam.vmsInfo;
    var err = null;
    callback(err, null);
}

// async function:
//
// Fetches information of existing vnets from opennebula
//
// asyncParam: object with attributes: rpcClient
// callback on success: err = null,
//                      param: object with attribute: vnetsInfo
//          on failure: err = true,
//                      param: null
//
function getVnetsInfo(asyncParam, callback) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var methodName = 'one.vnpool.info';
    var rpcParam = [getSessionString(), -2, -1, -1];

    console.log('async: fetching vnets data');

    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        var vnetPoolInfo;
        try {
            var json = xmlParser.toJson(value[1]);
            vnetPoolInfo = JSON.parse(json);
        } catch (e) {
            console.error('async: failed to convert/parse vnpool info: ' + e);
            err = true;
            callback(err, null);
            return;
        }

        var vnetsInfo = {};
        console.log('*********** VNETs **************');
        if (vnetPoolInfo.hasOwnProperty('VNET_POOL')) {
            var vnetPool = vnetPoolInfo.VNET_POOL;
            if (vnetPool.hasOwnProperty('VNET')) {
                if (Array.isArray(vnetPool.VNET)) {
                    vnetPool.VNET.forEach(function (vnet) {
                        vnetsInfo[vnet.NAME] = {id: vnet.ID};
                        console.log('id: ' + vnet.ID + ', name: ' + vnet.NAME);
                    });
                } else {
                    var vnet = vnetPool.VNET;
                    vnetsInfo[vnet.NAME] = {id: vnet.ID};
                    console.log('id: ' + vnet.ID + ', name: ' + vnet.NAME);
                }
            }
        }
        console.log('********************************');

        callback(err, {vnetsInfo: vnetsInfo});
    });
}

// async function:
//
// Stores information about vnets to global variable
//
// asyncParam: object with attribute: vnetsInfo
// callback err = null,
//         param: null
//
function storeVnetsInfo(asyncParam, callback) {
    console.log('async: storing vnets data');
    onevnetsInfo = asyncParam.vnetsInfo;
    var err = null;
    callback(err, null);
}

// async function:
//
// handles image which is in error state.
// this function is not in functions array of waterfall control flow,
// but is called by one which is. Thus the function signature and behaviour
// is similar.
//
// asyncParam: object with attributes: rpcClient,host
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function handleImageError(asyncParam, callback) {

    // handle image error state
    // 1. disable
    // 2. enable
    // 3. if still in error state: delete and create


    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var host = asyncParam.host;

    console.log('async: handling image ' + host.label + ', state ERROR!');

    var imageInfo = oneimagesInfo[host.label];

    // disable
    var methodName = 'one.image.enable';
    var rpcParam = [getSessionString(), imageInfo.id, false];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {

        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        // call succeeded: now enable
        var methodName2 = 'one.image.enable';
        var rpcParam = [getSessionString(), imageInfo.id, true];
        console.log('async: calling ' + methodName2 + ', param: ' + ['********'].concat(rpcParam.slice(1)));
        rpcClient.methodCall(methodName2, rpcParam, function (error, value) {

            if (error) {
                console.error('async: ' + methodName2 + ' failed: ' + error);
                err = true;
                callback(err, null);
                return;
            }
            if (!value || value[0] === false) {
                // command failed
                console.error('async: ' + methodName2 + ' error code ' + value[2] + ', ' + value[1]);
                err = true;
                callback(err, null);
                return;
            }

            // call succeeded
            console.log('async: ' + methodName2 + ' succeeded');

            // now check state
            var methodName3 = 'one.image.info';
            var rpcParam = [getSessionString(), imageInfo.id];
            console.log('async: calling ' + methodName3 + ', param: ' + ['********'].concat(rpcParam.slice(1)));
            rpcClient.methodCall(methodName3, rpcParam, function (error, value) {

                if (error) {
                    console.error('async: ' + methodName3 + ' failed: ' + error);
                    err = true;
                    callback(err, null);
                    return;
                }
                if (!value || value[0] === false) {
                    // command failed
                    console.error('async: ' + methodName3 + ' failed: error code ' + value[2] + ', ' + value[1]);
                    err = true;
                    callback(err, null);
                    return;
                }

                // call succeeded
                console.log('async: ' + methodName3 + ' succeeded');

                try {
                    var xmlImageInfo = xmlParser.toJson(value[1]);
                    var imageInfo = JSON.parse(xmlImageInfo);
                } catch (e) {
                    console.error('async: failed to convert/parse image info: ' + e);
                    err = true;
                    callback(err, null);
                    return;
                }

                if (!imageInfo.hasOwnProperty('IMAGE')) {
                    console.error('async: no IMAGE in one.image.info response');
                    err = true;
                    callback(err, null);
                    return;
                }

                if (imageInfo.IMAGE.STATE == IMAGE_STATE.ERROR) { // ERROR state

                    var methodName4 = 'one.image.delete';
                    var rpcParam = [getSessionString(), imageInfo.id];
                    console.log('async: calling ' + methodName4 + ', param: ' + ['********'].concat(rpcParam.slice(1)));
                    rpcClient.methodCall(methodName4, rpcParam, function (error, value) {

                        if (error) {
                            console.error('async: ' + methodName4 + ' failed: ' + error);
                            err = true;
                            callback(err, null);
                            return;
                        }
                        if (!value || value[0] === false) {
                            // command failed
                            console.error('async: ' + methodName4 + ' failed: error code ' + value[2] + ', ' + value[1]);
                            err = true;
                            callback(err, null);
                            return;
                        }

                        // call succeeded
                        console.log('async: ' + methodName4 + ' succeeded');

                        // delete succeeded: create
                        oneImageCreateAsync(asyncParam, callback);
                    });

                } else {

                    // all other states are considered as ok (??)
                    callback(err, null);
                }
            });
        });
    });
}

// async function:
//
// waits till image which in LOCKED state has reached READY state
//
// this function is not in functions array of waterfall control flow,
// but is called by one which is. Thus the function signature and behaviour
// is similar.
// asyncParam: object with attributes: rpcClient,host
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function awaitImage(asyncParam, callback) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var host = asyncParam.host;

    console.log('async: image ' + host.label + ' : await new image');

    var imageInfo = oneimagesInfo[host.label];

    var methodName = 'one.image.info';
    var rpcParam = [getSessionString(), imageInfo.id];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {

        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        try {
            var xmlImageInfo = xmlParser.toJson(value[1]);
            var imageInfo = JSON.parse(xmlImageInfo);
        } catch (e) {
            console.error('async: failed to convert/parse image info: ' + e);
            err = true;
            callback(err, null);
            return;
        }

        if (!imageInfo.hasOwnProperty('IMAGE')) {
            console.error('async: no IMAGE in one.image.info response');
            err = true;
            callback(err, null);
            return;
        }

        switch (imageInfo.IMAGE.STATE) {
            case IMAGE_STATE.READY:
                // reached state ready, this is what we want to reach
                // store SOURCE/STATE for further usage
                oneimagesInfo[host.label] = {
                    id: imageInfo.IMAGE.ID,
                    state: imageInfo.IMAGE.STATE,
                    source: imageInfo.IMAGE.SOURCE
                };

                console.log('async: image: ' + host.label + ', reached state READY --> OK');

                callback(err, null);
                return;
                break;
            case IMAGE_STATE.LOCKED:
                // still in state LOCKED: sleep and check state again
                console.log('async: image: ' + host.label + ', state: ' + printImageState(imageInfo.IMAGE.STATE) + ' --> WAIT FOR READY');
                sleep.sleep(30);
                awaitImage(asyncParam, callback);
                break;
            case IMAGE_STATE.INIT:
            case IMAGE_STATE.USED:
            case IMAGE_STATE.DISABLED:
            case IMAGE_STATE.ERROR:
            case IMAGE_STATE.CLONE:
            case IMAGE_STATE.DELETE:
            case IMAGE_STATE.USED_PERS:
            default:
                // all other states are considered as an error
                console.log('async: image: ' + host.label + ', state: ' + printImageState(imageInfo.IMAGE.STATE) + ' --> ERROR');
                err = true;
                callback(err, null);
                return;
                break;
        }
    });
}

// async function:
//
// Creates image
//
// asyncParam: object with attributes: json,rpcClient,imagesData,host
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function oneImageCreateAsync(asyncParam, callback) {

    var err = null;
    var json = asyncParam.json;
    var rpcClient = asyncParam.rpcClient;
    var imagesData = asyncParam.imagesData;
    var host = asyncParam.host;

    console.log('async: handle create image for ' + host.label);

    var imageInfo = oneimagesInfo[host.label];
    if (imageInfo) {

        createdImages.push({name: host.label, id: imageInfo.id});

        switch (imageInfo.state) {
            case IMAGE_STATE.LOCKED: // LOCKED: FS operation for the Image in process
                awaitImage(asyncParam, callback);
                return;
            case IMAGE_STATE.ERROR: // ERROR: Error state the operation FAILED
                handleImageError(asyncParam, callback);
                return;
            case IMAGE_STATE.INIT: // INIT: Initialization state
            case IMAGE_STATE.READY: // READY: Image ready to use
            case IMAGE_STATE.USED: // USED: Image in use
            case IMAGE_STATE.DISABLED: // DISABLED: Image can not be instantiated by a VM
            case IMAGE_STATE.CLONE: // CLONE: Image is being cloned
            case IMAGE_STATE.DELETE: // DELETE: DS is deleting the image
            case IMAGE_STATE.USED_PERS: // USED_PERS: Image is in use and persistent
            default:
                // do nothing
                console.log('async: image: ' + host.label + ', state: ' + printImageState(imageInfo.state) + ' no further processing --> OK');
                callback(err, null);
                return;
        }
    }


    // if we reach here the image has to be created.
    console.log('async: image: ' + host.label + ' --> CREATING IMAGE');


    var methodName = 'one.image.allocate';
    var fileName = path.join(json.base_path, json.image_path, imagesData[host.label].image_name);
    var attributes = util.format(ONEIMAGE_CREATE_ATTRIBUTES, 'yes', host.label, fileName, 'sd', 'os', 'qcow2');
    var dataStoreId = 1;
    var rpcParam = [getSessionString(), attributes, dataStoreId];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        var imageId = value[1];
        createdImages.push({name: host.label, id: imageId});
        oneimagesInfo[host.label] = {id: imageId};
        // we have to wait till the image reaches state READY
        awaitImage(asyncParam, callback);
    });

    /*
     var cmd = util.format('su -c \"oneimage create -d 1  --persistent --name \'%s\' --path %s --prefix sd --type os --driver qcow2\" oneadmin', host.label, imagepath);
     if (utilities.exec(cmd) != 0) {
     err = true;
     }
     */
}

// async function:
//
// Creates  new ip addresses and GRE tunnels
//
// asyncParam: object with attributes: json
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function createIpAddressesAndGreTunnelsAsync(asyncParam, callback) {

    var json = asyncParam.json;
    console.log('async: create IP addresses and GRE tunnels');
    var err = null;
    var status = true;
    if (json.hasOwnProperty('segment')) {
        json.segment.every(function (segment) {

            if (segment.hasOwnProperty('pnode')) {

                if (segment.pnode.length > 1) {

                    segment.pnode.every(function (pnode1) {

                        // create unused ip address in segment's range for every pnode
                        /*var netmask = utilities.getBitmaskFromCidr(segment.net);
                        var randomIp = utilities.getUnusedIpAddressInRange(segment.net, ipAddresses);
                        if (!randomIp) {
                            console.error('async: could not obtain unused ip address in ' + segment.net);
                            status = false;
                            return false;
                        }
                        // add ip address
                        var cmd = util.format('ssh root@%s ip addr add %s/%s dev %s', pnode1, randomIp, netmask, segment.ovswitch);
                        if (utilities.exec(cmd) != 0) {
                            status = false;
                            return false;
                        } else {
                            console.log('async: shelljs command succeeded');
                        }*/

                        // create GRE tunnels for all pnodes of segment
                        segment.pnode.every(function (pnode2) {

                            // no GRE tunnel to itself
                            if (pnode1 != pnode2) {

                                // get peer ip
                                var cmd = util.format('ssh root@%s  ip -4 -o addr | grep service-net |awk \'!/^[0-9]*: ?lo|link\\/ether/ {gsub(\"/\", \" \"); print $4}\'', pnode2);
                                var ret = utilities.execRet(cmd);

                                if (ret.code != 0) {
                                    status = false;
                                    return status;
                                } else {
                                    console.log('async: shelljs command succeeded');
                                }
                                var dst = ret.output;
                                dst = utilities.removeEOL(dst);

                                // setup conn
                                var cmd = util.format('ssh root@%s ovs-vsctl --may-exist add-port %s %s-gre -- set interface %s-gre type=gre options:remote_ip=%s',
                                    pnode1, segment.ovswitch, pnode2, pnode2, dst);
                                if (utilities.exec(cmd) != 0) {
                                    status = false;
                                    return status;
                                } else {
                                    console.log('async: shelljs command succeeded');
                                }
                            }
                            return status;
                        });

                        return status;
                    });
                }
            }

            return status;
        });
    }

    if (!status) {
        err = true;
    }
    callback(err, null);
}


// async function:
//
// awaits the vm to reach and state and then perform an action.
//
// asyncParam: object with attributes: rpcClient,vm,vmId,state
// action: function which is called when desired state is reached.
//         signature action(asyncParam, callback).
// callback: async callback which is called on error, asyncParam is passed as parameter to callback
// setCallbackError: true: callback is called with error = true, false otherwise.
//
function vmAwaitStateAsync(asyncParam, action, callback, setCallbackError) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var vm = asyncParam.vm;
    var expectedState = asyncParam.state;
    var vmId = asyncParam.vmId;

    console.log('async: await state ' + printVmState(expectedState) + ' for vm ' + vm);

    var methodName = 'one.vm.info';
    var rpcParam = [getSessionString(), vmId];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            if (setCallbackError) {
                err = true;
            }
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            if (setCallbackError) {
                err = true;
            }
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        try {
            var xmlvmInfo = xmlParser.toJson(value[1]);
            var vmInfo = JSON.parse(xmlvmInfo);
        } catch (e) {
            console.error('async: failed to convert/parse vm info: ' + e);
            if (setCallbackError) {
                err = true;
            }
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }
        if (!vmInfo.hasOwnProperty('VM')) {
            console.error('async: no VM in one.vm.info response');
            if (setCallbackError) {
                err = true;
            }
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }

        if (vmInfo.VM.STATE == expectedState) {
            console.log('async: vm ' + vm + ' reached state ' + printVmState(expectedState) + ' --> OK');

            if (action) {
                action(asyncParam, callback);
            }
        } else {
            console.log('async: vm ' + vm + ', state ' + printVmState(vmInfo.VM.STATE) + ' --> WAIT FOR ' + printVmState(expectedState));
            sleep.sleep(2);

            vmAwaitStateAsync(asyncParam, action, callback, setCallbackError);
        }
    });
}

// async function:
//
// Creates (if necessary) and deploys vm
//
// asyncParam: object with attributes: json,rpcClient,segment,host
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function oneVmCreateAndDeployAsync(asyncParam, callback) {

    var err = null;
    var json = asyncParam.json;
    var rpcClient = asyncParam.rpcClient;
    var segment = asyncParam.segment;
    var host = asyncParam.host;

    console.log('async: handling creation and deployment of vm ' + host.label);

    var vmInfo = onevmsInfo[host.label];
    if (vmInfo) {

        createdVms.push({name: host.label, id: vmInfo.id});

        switch (vmInfo.state) {
            case VM_STATE.FAILED:

                // failed state:
                // 1.: delete-recreate
                // 2.: hold
                // 3.: deploy

                console.log('async: handling vm state FAILED for ' + host.label + ' --> DELETE-RECREATE');

                var methodName1 = 'one.vm.action';
                var rpcParam1 = [getSessionString(), 'delete-recreate', vmInfo.id];
                console.log('async: calling ' + methodName1 + ', param: ' + ['********'].concat(rpcParam1.slice(1)));
                rpcClient.methodCall(methodName1, rpcParam1, function (error, value) {
                    if (error) {
                        console.error('async: ' + methodName1 + ' failed: ' + error);
                        err = true;
                        callback(err, null);
                        return;
                    }
                    if (!value || value[0] === false) {
                        // command failed
                        console.error('async: ' + methodName1 + ' failed: error code ' + value[2] + ', ' + value[1]);
                        err = true;
                        callback(err, null);
                        return;
                    }

                    // call succeeded
                    console.log('async: ' + methodName1 + ' succeeded');

                    asyncParam.vm = host.label;
                    asyncParam.vmId = vmInfo.id;
                    asyncParam.state = VM_STATE.PENDING;
                    vmAwaitStateAsync(asyncParam, oneVmHoldAndDeployAsync, callback, true);
                });
                return;
            case VM_STATE.DONE:
                // done: vm does no longer exist, but is kept in db: must be created
                break;
            case VM_STATE.HOLD: // hold
                // deploy the vm
                oneVmDeployAsync(asyncParam, callback);
                return;

            case VM_STATE.INIT: // init
            case VM_STATE.PENDING: // pending
            case VM_STATE.ACTIVE: // active
            case VM_STATE.STOPPED: // stopped
            case VM_STATE.SUSPENDED: // suspended
            case VM_STATE.POWEROFF: // poweroff
            case VM_STATE.UNDEPLOYED: // undeployed
            default:
                // do nothing
                console.log('async: vm ' + host.label + ' is in state ' + printVmState(vmInfo.state) + ' --> no further action');
                callback(err, null);
                return;
        }
    }

    console.log('async: creating vm for ' + host.label);


    // if we reach here the vm must be created
    var fileName = path.join(json.output_path, host.label + stage.ONEVM_EXT);
    var template = utilities.readFile(fileName);
    if (template == null) {
        err = true;
        callback(err, null);
        return;
    }

    var methodName = 'one.vm.allocate';
    var hold = true;
    var rpcParam = [getSessionString(), template, hold];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        onevmsInfo[host.label] = {id: value[1]};
        createdVms.push({name: host.label, id: value[1]});
        // call succeeded: deploy
        oneVmDeployAsync(asyncParam, callback);
    });
    /*
     var cmd = util.format('su -c \"onevm create \'%s/%s\' --hold\" oneadmin', json.output_path, fileName);
     if (utilities.exec(cmd) != 0) {
     err = true;
     }
     */
}

// async function:
//
// Hold vm, deploy vm
//
// this function is not in functions array of waterfall control flow,
// but is called by one which is. Thus the function signature and behaviour
// is similar.

// asyncParam: object with attributes: json,rpcClient,segment,host
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function oneVmHoldAndDeployAsync(asyncParam, callback) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var host = asyncParam.host;
    var vmId = asyncParam.vmId;

    console.log('async: handling vm ' + host.label + ' --> HOLD');

    var methodName = 'one.vm.action';
    var rpcParam = [getSessionString(), 'hold', vmId];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed

            //todo hold command fails redo delete-recreate. possibly oneVmCreateAndDeployAsync() can be called
            // here (but not callback of course). Eventually the vm state in onevmsInfo must be updated

            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        asyncParam.state = VM_STATE.HOLD;
        vmAwaitStateAsync(asyncParam, oneVmDeployAsync, callback, true);

    });
}


// async function:
//
// Deploys vm
//
// this function is not in functions array of waterfall control flow,
// but is called by one which is. Thus the function signature and behaviour
// is similar.

// asyncParam: object with attributes: json,rpcClient,segment,host
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function oneVmDeployAsync(asyncParam, callback) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var segment = asyncParam.segment;
    var host = asyncParam.host;

    console.log('async: deploying vm ' + host.label);


    var pnode = host.pnode;
    // if host's pnode is not set take segment's pnode
    if (utilities.isNullOrEmpty(pnode)) {
        pnode = segment.pnode[0];
    }

    var vmInfo = onevmsInfo[host.label];
    if (!vmInfo) {
        console.log('async: cannot get vm Id for ' + host.label);
        err = true;
        callback(err, null);
        return;
    }
    var hostInfo = onehostsInfo[pnode];
    if (!hostInfo) {
        console.log('async: cannot get host Id for ' + pnode);
        err = true;
        callback(err, null);
        return;
    }

    var methodName = 'one.vm.deploy';
    var dataStoreId = 1;
    var enforceNoOverCommittment = false;
    // the param array does not match the 4.6 documentation (removed datastoreId from parameter)
    var rpcParam = [getSessionString(), vmInfo.id, hostInfo.id, enforceNoOverCommittment];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            err = true;
            callback(err, null);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            err = true;
            callback(err, null);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        callback(err, null);
    });

    /*
     var cmd = util.format('su -c \"onevm deploy \'%s\' \'%s\'\" oneadmin', host.label, pnode);
     if (utilities.exec(cmd) != 0) {
     err = true;
     }
     */
}

// async function:
//
// Mounts and sets config for vm
//
// asyncParam: object with attributes: json,imagesData,host,isHost
// callback on success: err = null,
//                      param: null
//          on failure: err = true,
//                      param: null
//
function mountAndSetConfigAsync(asyncParam, callback) {

    var err = null;
    var json = asyncParam.json;
    var imagesData = asyncParam.imagesData;
    var host = asyncParam.host;
    var isHost = asyncParam.isHost;

    console.log('async: mount and set config for ' + host.label);

    var imageData = imagesData[host.label];

    var oneimageInfo = oneimagesInfo[host.label];
    if (!oneimageInfo || !oneimageInfo.source) {
        console.error('async: image info not available for ' + host.label);
        err = true;
        callback(err, null);
        return;
    }

    if (oneimageInfo.state != IMAGE_STATE.READY) {
        console.log('async: mount and set config for ' + host.label + ' state: ' + printImageState(oneimageInfo.state) + ' --> mount and set config not necessary');
        callback(err, null);
        return;
    }

    var imageName = oneimageInfo.source;

    // remove \n from imageName because commands with \n block in shelljs.
    imageName = utilities.removeEOL(imageName);

    if (utilities.exec('lsmod | grep nbd') == 1) {
        if (utilities.exec('modprobe nbd max_part=63') != 0) {
            err = true;
            callback(err, null);
            return;
        } else {
            console.log('async: shelljs command succeeded');
        }
    }
    var cmd = 'qemu-nbd -c /dev/nbd0 ' + imageName;
    if (utilities.exec(cmd) != 0) {
        err = true;
        callback(err, null);
        return;
    } else {
        console.log('async: shelljs command succeeded');
    }


    if (utilities.exec('file /mnt/setup') == 1) {
        if (utilities.exec('mkdir /mnt/setup') != 0) {
            err = true;
            callback(err, null);
            return;
        } else {
            console.log('async: shelljs command succeeded');
        }
    }

    if (utilities.exec('mount | grep /mnt/setup') != 1) {
        if (utilities.exec('umount /mnt/setup') != 0) {
            err = true;
            callback(err, null);
            return;
        } else {
            console.log('async: shelljs command succeeded');
        }
    }


    var vg_lv = imageData.vg_lv;
    // vg_lv is either null or of the format vg/lv
    if (vg_lv) {
        var vg = vg_lv;
        var idx = vg_lv.indexOf('/');
        if (idx != -1) {
            vg = vg_lv.substring(0, idx);
        }
        var cmd = util.format('vgchange -a y %s; mount /dev/%s /mnt/setup', vg, vg_lv);
        if (utilities.exec(cmd) != 0) {
            err = true;
            callback(err, null);
            return;
        } else {
            console.log('async: shelljs command succeeded');
        }

    } else {
        var cmd = util.format('mount /dev/nbd0p%s /mnt/setup', imageData.root_partition_id);
        if (utilities.exec(cmd) != 0) {
            err = true;
            callback(err, null);
            return;
        } else {
            console.log('async: shelljs command succeeded');
        }

    }
    var os = host.os.toLowerCase();

    var isWindows = os.indexOf('windows') != -1;

    if (isHost) {
        if (!writeInterfaceFiles4Host(json, host, isWindows)) {
            err = true;
            callback(err, null);
            return;
        }
    } else {
        if (!writeInterfaceAndRulesFiles4Gateway(json, host, isWindows)) {
            err = true;
            callback(err, null);
            return;
        }
    }

    if (utilities.exec('umount /mnt/setup') != 0) {
        err = true;
        callback(err, null);
        return;
    } else {
        console.log('async: shelljs command succeeded');
    }

    if (vg_lv) {
        var cmd = util.format('vgchange -a n %s', vg);
        if (utilities.exec(cmd) != 0) {
            err = true;
            callback(err, null);
            return;
        } else {
            console.log('async: shelljs command succeeded');
        }
    }

    if (utilities.exec('qemu-nbd -d /dev/nbd0') != 0) {
        err = true;
        callback(err, null);
        return;
    } else {
        console.log('async: shelljs command succeeded');
    }

    callback(err, null);
}


//
// Performs a rollback of allocated resources (vnets, images, vms).
//
//
function rollback(rpcClient) {

    var asyncFunctions = [];

    function firstRollbackAsync(callback) {
        console.log('async: initialize async rollback waterfall function chain');
        var err = null;
        callback(err, null);
    }

    asyncFunctions.push(firstRollbackAsync);

    var deleteVms = false;
    var deleteImages = false;
    var deleteVnets = false;


    var answer = readline.question('Shall the created/deployed VMs be deleted? [yes/No] :');
    if (utilities.isYes(answer)) {
        deleteVms = true;
    }

    var answer = readline.question('Shall the created images be deleted? [yes/No] :');
    if (utilities.isYes(answer)) {
        deleteImages = true;
    }
    var answer = readline.question('Shall the create vnets be deleted? [yes/No] :');
    if (utilities.isYes(answer)) {
        deleteVnets = true;
    }

    if (deleteVms) {
        for (var i = 0; i < createdVms.length; i++) {
            // this is necessary because this creates a closure
            (function (i) {
                function iterateDeleteVmAsync(asyncParam, callback) {
                    console.log('async: iterate delete vm');
                    if (!asyncParam) {
                        asyncParam = {};
                    }
                    var err = null;
                    asyncParam.rpcClient = rpcClient;
                    asyncParam.vm = createdVms[i].name;
                    asyncParam.vmId = createdVms[i].id;

                    callback(err, asyncParam);
                }

                // push the delete vm iterator function which passes the correct parameters
                asyncFunctions.push(iterateDeleteVmAsync);
                asyncFunctions.push(cleanup.oneVmDeleteAsync);
            })(i);
        }
    }

    if (deleteImages) {
        for (var i = 0; i < createdImages.length; i++) {
            // this is necessary because this creates a closure
            (function (i) {
                function iterateDeleteImageAsync(asyncParam, callback) {
                    console.log('async: iterate delete image');
                    if (!asyncParam) {
                        asyncParam = {};
                    }
                    var err = null;
                    asyncParam.rpcClient = rpcClient;
                    asyncParam.image = createdImages[i].name;
                    asyncParam.imageId = createdImages[i].id;
                    callback(err, asyncParam);
                }

                // push the delete image iterator function which passes the correct parameters
                asyncFunctions.push(iterateDeleteImageAsync);
                asyncFunctions.push(cleanup.oneImageDeleteAsync);
            })(i);
        }
    }

    if (deleteVnets) {
        for (var i = 0; i < createdVnets.length; i++) {
            // this is necessary because this creates a closure
            (function (i) {
                function iterateDeleteVnetAsync(asyncParam, callback) {
                    console.log('async: iterate delete vnet');
                    if (!asyncParam) {
                        asyncParam = {};
                    }
                    var err = null;
                    asyncParam.rpcClient = rpcClient;
                    asyncParam.vnet = createdVnets[i].name;
                    asyncParam.vnetId = createdVnets[i].id;
                    callback(err, asyncParam);
                }

                // push the delete vnet iterator function which passes the correct parameters
                asyncFunctions.push(iterateDeleteVnetAsync);
                asyncFunctions.push(cleanup.oneVnetDeleteAsync);
            })(i);
        }

        for (var i = 0; i < createdBridges.length; i++) {
            // this is necessary because this creates a closure
            (function (i) {
                function iterateDeleteBridgeAsync(asyncParam, callback) {
                    console.log('async: iterate delete bridge');
                    if (!asyncParam) {
                        asyncParam = {};
                    }
                    var err = null;
                    asyncParam.bridge = createdBridges[i].bridge;
                    asyncParam.pnode = createdBridges[i].pnode;
                    callback(err, asyncParam);
                }

                // push the delete bridge iterator function which passes the correct parameters
                asyncFunctions.push(iterateDeleteBridgeAsync);
                asyncFunctions.push(cleanup.deleteBridgeAsync);
            })(i);
        }
    }

    function finalRollbackCallbackAsync(err, asyncParam) {

        console.log('async: final rollbackcallback called');
        console.log('async: rollback done');
        if (asyncParam && asyncParam.failed) {
            console.log('rollback failed: not all resources could be deleted');
        }
        process.exit(1);
    }

    async.waterfall(asyncFunctions, finalRollbackCallbackAsync);
}

//
// Reads the one_auth file and stores the data as sessionString
//
//
function storeSessionString(oneAuthPath) {

    sessionString = utilities.readFile(oneAuthPath);
    if (!sessionString) {
        return false;
    }

    // remove EOLs from string
    var idx = sessionString.indexOf(EOL);
    if (idx != -1) {
        sessionString = sessionString.substring(0, idx);
    }
    return true;
}

//
// Returns the sessionString.
//
//
function getSessionString() {
    return sessionString;
}

//
// Creates an xml-rpc client for requests to opennebula
//
//
function createRpcClient() {

    if (utilities.TEST_MODE) {

        var vnpoolinfo = utilities.readFile('vnPoolTest.xml');
        var imagepoolinfo = utilities.readFile('imagePoolTest.xml');
        var vmpoolinfo = utilities.readFile('vmPoolTest.xml');
        var hostpoolinfo = utilities.readFile('hostPoolTest.xml');

        function methodCall(methodName, param, callback) {
            console.log('test rcpclient: running ' + methodName + ', ' + param);
            sleep.sleep(2);
            var retval;

            switch (methodName) {
                case 'one.vnpool.info':
                    retval = vnpoolinfo;
                    break;
                case 'one.imagepool.info':
                    retval = imagepoolinfo;
                    break;
                case 'one.hostpool.info':
                    retval = hostpoolinfo;
                    break;
                case 'one.vmpool.info':
                    retval = vmpoolinfo;
                    break;
                case 'one.vn.delete':
                    retval = 1;
                    break;
                case 'one.vn.allocate':
                    retval = 1234;
                    break;
                case 'one.image.enable':
                    retval = 1;
                    break;
                case 'one.image.delete':
                    retval = 1;
                    break;
                case 'one.image.info':
                    retval =
                        '<IMAGE><ID>98' +
                        '</ID><UID>0' +
                        '</UID><GID>0' +
                        '</GID><UNAME>oneadmin' +
                        '</UNAME><GNAME>oneadmin' +
                        '</GNAME><NAME>n1-Investigator CPT' +
                        '</NAME><TYPE>0' +
                        '</TYPE><DISK_TYPE>0' +
                        '</DISK_TYPE><PERSISTENT>1' +
                        '</PERSISTENT><REGTIME>1415755091' +
                        '</REGTIME><SOURCE>/var/lib/one//datastores/1/f86d55e424fc83e28598b289e2dd06b3' +
                        '</SOURCE><PATH>/home/rekil/tmp/base/images/ubuntu-clnt1.qcow2' +
                        '</PATH><FSTYPE>' +
                        '</FSTYPE><SIZE>16384' +
                        '</SIZE><STATE>1' +
                        '</STATE><RUNNING_VMS>1' +
                        '</RUNNING_VMS><CLONING_OPS>0' +
                        '</CLONING_OPS><CLONING_ID>-1' +
                        '</CLONING_ID><DATASTORE_ID>1' +
                        '</DATASTORE_ID><DATASTORE>default' +
                        '</DATASTORE><VMS><ID>89' +
                        '</ID>' +
                        '</VMS><CLONES>' +
                        '</CLONES><TEMPLATE><DEV_PREFIX><![CDATA[sd]]>' +
                        '</DEV_PREFIX><DRIVER><![CDATA[qcow2]]>' +
                        '</DRIVER>' +
                        '</TEMPLATE>' +
                        '</IMAGE>';
                    break;
                case 'one.image.allocate':
                    retval = 123456;
                    break;
                case 'one.vm.action':
                    retval = 1;
                    break;
                case 'one.vm.allocate':
                    retval = 12345;
                    break;
                case 'one.vm.deploy':
                    retval = 1;
                    break;
                default:
                    retval = 'not yet implemented test method';
                    break;
            }
            callback(false, [true, retval, 0]);
        }

        return {methodCall: methodCall};
    } else {
        return xmlrpc.createClient({host: OPENNEBULA_HOST, port: OPENNEBULA_RPC_PORT, path: OPENNEBULA_RPC_PATH});
    }
}

//
// the API of the xml-rpc package which is used to execute the calls to Opennebula provides asynchronous
// methods. Thus the async package is used to avoid an callback code hell.
// The waterfall approach of async is used.
// the functions are executed in a sequence, where execution of the next function is triggered
// by calling the callback in the currently executed function.
// in the waterfall approach the params of the callback of the current function are passed to the next
// function to be executed
// Thus callback and function signatures must 'match':
// asyncfunction(params, callback)
// callback(error, params)
// number and type of params in callback and asyncfunction must match
// In this implementation params is always ONE object.
// the execution of the functions is aborted when callback is called with error != null. Then
// the final function is called.
//
//
//
//
function performSetup(json, oneAuthPath, imagesData) {

    // get all ip addresses from hosts and gateways and store them
    ipAddresses = validator.validateIpAddresses();


    // get the data from the one_auth file
    if (!storeSessionString(oneAuthPath)) {
        process.exit(1);
    }

    // create the xml-rpc client

    var rpcClient = createRpcClient();

    // array containing the functions which are executed in the async waterfall control flow.
    var asyncFunctions = [];

    // add a  function at the beginning of the function chain (the 1st function never has any parameters except callback)
    function firstSetupAsync(callback) {
        console.log('async: initialize async setup waterfall function chain');
        var err = null;
        callback(err, null);
    }

    asyncFunctions.push(firstSetupAsync);


    // async function
    // 'Returns' json config and rpcClient via callback
    // asyncParam: not used
    // callback err = null,
    //          param: object with attributes: json, rpcClient
    //
    function passJsonRpcClientParamsAsync(asyncParam, callback) {
        console.log('async: pass json and rpcClient');
        var err = null;
        callback(err, {json: json, rpcClient: rpcClient});
    }

    // get id/name of the existing vnets
    asyncFunctions.push(passJsonRpcClientParamsAsync);
    asyncFunctions.push(getVnetsInfo);
    // store the returned data
    asyncFunctions.push(storeVnetsInfo);

    // get id/name/state of the existing images
    asyncFunctions.push(passJsonRpcClientParamsAsync);
    asyncFunctions.push(getImagesInfo);
    // store the returned data
    asyncFunctions.push(storeImagesInfo);

    // get id/name of the existing hosts
    asyncFunctions.push(passJsonRpcClientParamsAsync);
    asyncFunctions.push(getHostsInfo);
    // store the returned data
    asyncFunctions.push(storeHostsInfo);

    // get id/name/state of the existing vms
    asyncFunctions.push(passJsonRpcClientParamsAsync);
    asyncFunctions.push(getVmsInfo);
    // store the returned data
    asyncFunctions.push(storeVmsInfo);

    if (json.hasOwnProperty('segment')) {

        json.segment.forEach(function (segment) {
            if (segment.hasOwnProperty('pnode')) {
                segment.pnode.forEach(function (pnode) {

                    // async function
                    // 'Returns' bridge, pnode via callback
                    // asyncParam: not used
                    // callback err = null,
                    //          param: object with attributes: bridge,pnode
                    //
                    function iterateCreateBridgeAsync(asyncParam, callback) {
                        console.log('async: iterate create bridge ' + segment.ovswitch);
                        var err = null;
                        callback(err, {bridge: segment.ovswitch, pnode: pnode});
                    }

                    // push the create bridge iterator function which passes the correct parameters
                    asyncFunctions.push(iterateCreateBridgeAsync);

                    // push the createBridgeAsync function
                    asyncFunctions.push(createBridgeAsync);
                });
            }
        });

        json.segment.forEach(function (segment) {

            // async function
            // 'Returns' json,rpcClient,vnet via callback
            // asyncParam: not used
            // callback err = null,
            //          param: object with attributes: json, rpcClient, vnet
            //
            function iterateCreateOneVnetAsync(asyncParam, callback) {
                console.log('async: iterate create onevnet ' + segment.label);
                var err = null;
                callback(err, {json: json, rpcClient: rpcClient, vnet: segment.label});
            }

            // push the create onevnet iterator function which passes the correct parameters
            asyncFunctions.push(iterateCreateOneVnetAsync);
            // push the oneVnetCreateAsync function for each segment.
            asyncFunctions.push(oneVnetCreateAsync);
        });

        json.segment.forEach(function (segment) {
            if (segment.hasOwnProperty('phydev')) {
                segment.phydev.forEach(function (phydev) {
                    function iterateAddPhyDevAsync(asyncParam, callback) {
                        console.log('async: iterate add phydev ' + phydev);
                        var err = null;
                        callback(err, {bridge: segment.ovswitch, phydev: phydev});
                    }

                    asyncFunctions.push(iterateAddPhyDevAsync);

                    asyncFunctions.push(addPhyDevAsync);
                });
            }
        });

        // push the function creating the random ip addresses and the GRE tunnels
        asyncFunctions.push(passJsonRpcClientParamsAsync);
        asyncFunctions.push(createIpAddressesAndGreTunnelsAsync);

        json.segment.forEach(function (segment) {

            // handle hosts
            if (segment.hasOwnProperty('host')) {


                segment.host.forEach(function (host) {

                    // async function
                    // 'Returns' json,rpcClient,imagesData,host via callback
                    // asyncParam: not used
                    // callback err = null,
                    //          param: object with attributes: json, rpcClient, imagesData, host
                    //
                    function iterateCreateOneimageHostAsync(asyncParam, callback) {
                        console.log('async: iterate create oneimage for host ' + host.label);
                        var err = null;
                        callback(err, {
                            json: json,
                            rpcClient: rpcClient,
                            imagesData: imagesData,
                            host: host
                        });
                    }

                    // push the create oneimage iterator function which passes the correct parameters
                    asyncFunctions.push(iterateCreateOneimageHostAsync);
                    //push oneImageCreateAsync for each host
                    asyncFunctions.push(oneImageCreateAsync);
                });

                segment.host.forEach(function (host) {

                    // async function
                    // 'Returns' json,rpcClient,imagesData,host, isHost via callback
                    // asyncParam: not used
                    // callback err = null,
                    //          param: object with attributes: json, rpcClient, imagesData, host, isHost
                    //
                    function iterateMountAndSetConfigHostAsync(asyncParam, callback) {
                        console.log('async: iterate mount and set config for host ' + host.label);
                        var err = null;
                        callback(err, {
                            json: json,
                            rpcClient: rpcClient,
                            imagesData: imagesData,
                            host: host,
                            isHost: true
                        });
                    }

                    // push the create oneimage iterator function which passes the correct parameters
                    asyncFunctions.push(iterateMountAndSetConfigHostAsync);
                    asyncFunctions.push(mountAndSetConfigAsync);
                });
            }

            // handle gateways
            if (segment.hasOwnProperty('gateway')) {

                segment.gateway.forEach(function (gateway) {

                    // async function
                    // 'Returns' json,rpcClient,imagesData,host via callback
                    // asyncParam: not used
                    // callback err = null,
                    //          param: object with attributes: json, rpcClient, imagesData, host
                    //
                    function iterateCreateOneimageGatewayAsync(asyncParam, callback) {
                        console.log('async: iterate create oneimage for gateway ' + gateway.label);
                        var err = null;
                        callback(err, {
                            json: json,
                            rpcClient: rpcClient,
                            imagesData: imagesData,
                            host: gateway
                        });
                    }

                    // push the create oneimage iterator function which passes the correct parameters
                    asyncFunctions.push(iterateCreateOneimageGatewayAsync);
                    //push oneImageCreateAsync for each host
                    asyncFunctions.push(oneImageCreateAsync);
                });

                segment.gateway.forEach(function (gateway) {

                    // async function
                    // 'Returns' json,rpcClient,imagesData,host, isHost via callback
                    // asyncParam: not used
                    // callback err = null,
                    //          param: object with attributes: json, rpcClient, imagesData, host, isHost
                    //
                    function iterateMountAndSetConfigGatewayAsync(asyncParam, callback) {
                        console.log('async: iterate mount and set config for gateway ' + gateway.label);
                        var err = null;
                        callback(err, {
                            json: json,
                            rpcClient: rpcClient,
                            imagesData: imagesData,
                            host: gateway,
                            isHost: false
                        });
                    }

                    // push the create oneimage iterator function which passes the correct parameters
                    asyncFunctions.push(iterateMountAndSetConfigGatewayAsync);
                    asyncFunctions.push(mountAndSetConfigAsync);
                });

            }
        });


        json.segment.forEach(function (segment) {

            // handle hosts
            if (segment.hasOwnProperty('host')) {

                segment.host.forEach(function (host) {

                    // async function
                    // 'Returns' json,rpcClient,segment,host via callback
                    // asyncParam: not used
                    // callback err = null,
                    //          param: object with attributes: json, rpcClient, segment, host
                    //
                    function iterateCreateAndDeployOneVmHostAsync(asyncParam, callback) {
                        console.log('async: iterate create onevm for host ' + host.label);
                        var err = null;
                        callback(err, {
                            json: json,
                            rpcClient: rpcClient,
                            segment: segment,
                            host: host
                        });
                    }

                    // push the onevm create and deploy iterator function which passes the correct parameters
                    asyncFunctions.push(iterateCreateAndDeployOneVmHostAsync);
                    // push createOnevm function for each host
                    asyncFunctions.push(oneVmCreateAndDeployAsync);
                });
            }

            // handle gateways

            if (segment.hasOwnProperty('gateway')) {
                segment.gateway.forEach(function (gateway) {

                    // async function
                    // 'Returns' json,rpcClient,segment,host via callback
                    // asyncParam: not used
                    // callback err = null,
                    //          param: object with attributes: json, rpcClient, segment, host
                    //
                    function iterateCreateAndDeployOneVmGatewayAsync(asyncParam, callback) {
                        console.log('async: iterate create onevm for gateway ' + gateway.label);
                        var err = null;
                        callback(err, {
                            json: json,
                            rpcClient: rpcClient,
                            segment: segment,
                            host: gateway
                        });
                    }

                    // push the onevm create and deploy iterator function which passes the correct parameters
                    asyncFunctions.push(iterateCreateAndDeployOneVmGatewayAsync);
                    // push createOnevm function for each host
                    asyncFunctions.push(oneVmCreateAndDeployAsync);
                });
            }
        });
    }

    // final function called as last function or immediately if one of the functions
    // calls callback with error != null
    //
    function finalSetupCallbackAsync(err, asyncParam) {

        console.log('async: final setup callback called');
        if (err) {
            console.log('SETUP failed');
            rollback(rpcClient);
            return;
        }

        console.log('SETUP succeeded');
    }

    // start execution of the functions
    async.waterfall(asyncFunctions, finalSetupCallbackAsync);
}


//
// Writes interface files for host.
//
//
function writeInterfaceFiles4Host(json, host, isWindows) {

    var status = true;

    if (host.hasOwnProperty('ip')) {
        var iface = 0;
        host.ip.every(function (ip) {

            // get the segment to whose cidr the ip matches
            var segment = getSegment(json, ip);
            if (segment) {
                if (host.gw) {
                    var gwStr = '';
                    // the gateway address is also in the range of the segment's cidr:
                    // the gateway is added to the current interface file.
                    if (utilities.isIpInRange(host.gw, segment.net)) {
                        if (isWindows) {
                            gwStr = host.gw;
                        } else {
                            gwStr = util.format(UBUNTU_GATEWAY_TEMPLATE, host.gw);
                        }
                    }
                }
                var netmask;
                if (isWindows) {
                    netmask = utilities.getMaskFromCidr(segment.net);

                } else {
                    netmask = utilities.getBitmaskFromCidr(segment.net);
                }

                var nsStr1 = '';
                var nsStr2 = '';
                if (iface == 0 && host.hasOwnProperty('ns') && host.ns.length > 0) {
                    // if the host has ns entries we add them to the 1st interface file we generate

                    if (isWindows) {
                        nsStr1 = host.ns[0];
                        nsStr2 = (host.ns[1] ? host.ns[1] : '');
                    } else {
                        nsStr1 = util.format(UBUNTU_DNS_TEMPLATE, host.ns[0], (host.ns[1] ? host.ns[1] : ''));
                    }
                }
                var ifaceStr;
                if (isWindows) {
                    //var lanCon = 'LAN-Verbindung' + ((iface == 0) ? '' : (' ' + (iface + 1)));
                    var lanCon = 'Local Area Connection' + ((iface == 0) ? '' : (' ' + (iface + 1)));
                    ifaceStr = util.format(WINDOWS_TEMPLATE, lanCon, getSrvRole(host.os), ip, netmask, gwStr, nsStr1, nsStr2);

                } else {
                    ifaceStr = util.format(UBUNTU_TEPMLATE, iface, iface, ip, netmask) + gwStr + nsStr1;
                }

                console.log('*********************** ' + host.label + ' / ' + ip + '\n' + ifaceStr + '***********************************************************');
                var fileName;
                var pa;
                if (isWindows) {
                    if (utilities.TEST_MODE) {
                        pa = '/tmp/setup/config/netconns';

                    } else {
                        pa = '/mnt/setup/config/netconns';
                    }
                    fileName = path.join(pa, 'nc' + iface + '.cmd');
                } else {
                    if (utilities.TEST_MODE) {
                        pa = '/tmp/setup/etc/network/interfaces.d';
                    } else {
                        pa = '/mnt/setup/etc/network/interfaces.d';
                    }
                    fileName = path.join(pa, 'eth' + iface + '.cfg');
                }
                var fd;
                try {

                    // write the interface file
                    mkdirp.sync(pa);
                    fd = fs.openSync(fileName, FILEFLAG);
                    fs.writeSync(fd, ifaceStr);

                } catch (e) {

                    console.error('failed to write file ' + fileName + ' :' + e);
                    status = false;

                } finally {
                    if (fd) {
                        fs.closeSync(fd);
                    }
                }
            } else {
                console.log('cannot find net for ip ' + ip);
                status = false;
            }

            iface++;

            return status;
        });
    }
    return status;
}

//
// Writes interface and rules file for gateway
//
//
function writeInterfaceAndRulesFiles4Gateway(json, gateway, isWindows) {

    var status = true;

    // write iptables.rules file
    if (gateway.hasOwnProperty('iptables')) {

        var rulesStr = '';
        gateway.iptables.forEach(function (iptable) {

            rulesStr = rulesStr + util.format(GW_IPTABLES_TEMPLATE, iptable.inport, iptable.dst, iptable.outport, iptable.dst, iptable.outport);
        });

        rulesStr = rulesStr + 'exit 0' + EOL;
        console.log('*********************** ' + gateway.label + ' / iptables.rules:\n ' + rulesStr + '***********************************************************');

        if (utilities.TEST_MODE) {
            var pa = '/tmp/setup/etc';
        } else {
            var pa = '/mnt/setup/etc';
        }
        var fileName = path.join(pa, 'rc.local');
        var fd;
        try {

            mkdirp.sync(pa);
            fd = fs.openSync(fileName, FILEFLAG);
            fs.writeSync(fd, rulesStr);

        } catch (e) {

            console.error('failed to write file ' + fileName + ' :' + e);
            status = false;

        } finally {

            if (fd) {
                fs.closeSync(fd);
            }
        }
    }

    if (!status) {
        return false;
    }


    var iface = 0;


    // handle ipin
    if (!writeInterfaceFile4Gateway(json, gateway, gateway.ipin, iface, isWindows)) {
        return status;
    }

    iface++;

    // handle ipout
    if (!writeInterfaceFile4Gateway(json, gateway, gateway.ipout, iface, isWindows)) {
        return status;
    }

    return status;
}

//
//
//
//
function writeInterfaceFile4Gateway(json, gateway, ip, iface, isWindows) {

    var status = true;

    // get the segment to whose cidr the ip matches
    var segment = getSegment(json, ip);
    if (segment) {
        var netmask;
        if (isWindows) {
            netmask = utilities.getMaskFromCidr(segment.net);
        } else {
            netmask = utilities.getBitmaskFromCidr(segment.net);
        }

        var nsStr1 = '';
        var nsStr2 = '';
        var ruleStr = '';
        if (iface == 0) {
            if (gateway.hasOwnProperty('ns') && gateway.ns.length > 0) {
                // if the host has ns entries we add them to the 1st iface file we generate

                if (isWindows) {
                    nsStr1 = gateway.ns[0];
                    nsStr2 = (gateway.ns[1] ? gateway.ns[1] : '');
                } else {
                    nsStr1 = util.format(UBUNTU_DNS_TEMPLATE, gateway.ns[0], (gateway.ns[1] ? gateway.ns[1] : ''));
                }
            }

            //ruleStr = 'pre-up iptables-restore < /etc/iptables.rules' + EOL;
            ruleStr = '' + EOL;

        }

        var ifaceStr;
        if (isWindows) {
            var lanCon = 'LAN-Verbindung' + ((iface == 0) ? '' : (' ' + (iface + 1)));
            ifaceStr = util.format(WINDOWS_TEMPLATE, lanCon, getSrvRole(gateway.os), ip, netmask, '', nsStr1, nsStr2);

        } else {
            ifaceStr = util.format(UBUNTU_TEPMLATE, iface, iface, ip, netmask) + nsStr1 + ruleStr;
        }

        console.log('*********************** ' + gateway.label + ' / ' + ip + '\n' + ifaceStr + '***********************************************************');
        var fileName;
        var pa;
        if (isWindows) {
            if (utilities.TEST_MODE) {
                pa = '/tmp/setup/config/netconns';
            } else {
                pa = '/mnt/setup/config/netconns';
            }
            fileName = path.join(pa, 'nc' + iface + '.cmd');
        } else {
            if (utilities.TEST_MODE) {
                pa = '/tmp/setup/etc/network/interfaces.d';
            } else {
                pa = '/mnt/setup/etc/network/interfaces.d';
            }
            fileName = path.join(pa, 'eth' + iface + '.cfg');
        }
        var fd;
        try {

            mkdirp.sync(pa);
            fd = fs.openSync(fileName, FILEFLAG);
            fs.writeSync(fd, ifaceStr);

        } catch (e) {

            console.error('failed to write file ' + fileName + ' :' + e);
            status = false;

        } finally {
            if (fd) {
                fs.closeSync(fd);
            }
        }
    } else {
        console.log('cannot find net for ip ' + ip);
        status = false;
    }

    return status;
}

//
// Returns the srvRole string for the os.
//
function getSrvRole(os) {
    if (os.indexOf('_active_directory') != -1) {
        return 'dc';
    }
    if (os.indexOf('_fs') != -1) {
        return 'fs';
    }
    if (os.indexOf('_exchange') != -1) {
        return 'exch';
    }
    if (os.indexOf('windows7') != -1) {
        return 'clnt';
    }

    return '';
}

//
// Returns the netmask of the segment's 'net' the ip address 'ip' matches.
//
function getSegment(json, ip) {

    var segment = null;
    if (json.hasOwnProperty('segment')) {
        json.segment.every(function (seg) {
            if (utilities.isIpInRange(ip, seg.net)) {
                segment = seg;
                return false;
            } else {
                return true;
            }
        });
    }

    return segment;
}


exports.doSetup = doSetup;
exports.getSessionString = getSessionString;
exports.storeSessionString = storeSessionString;
exports.getVnetsInfo = getVnetsInfo;
exports.getImagesInfo = getImagesInfo;
exports.getHostsInfo = getHostsInfo;
exports.getVmsInfo = getVmsInfo;
exports.createRpcClient = createRpcClient;
exports.vmAwaitStateAsync = vmAwaitStateAsync;
exports.VM_STATE = VM_STATE;
