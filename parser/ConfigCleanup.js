var util = require('util');
var os = require('os');
var fs = require('fs');
var async = require('async');

var utilities = require('./ConfigUtilities');
var setup = require('./ConfigSetup');

var oneimagesInfo = {};
var onehostsInfo = {};
var onevmsInfo = {};
var onevnetsInfo = {};


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
//
//
//
//
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
// deletes a bridge from pnode
//
// asyncParam: object with attributes: bridge,pnode
// callback err = null,
//          param: asyncParam. On error attribute/value failed : true is added
//
function deleteBridgeAsync(asyncParam, callback) {

    var err = null;
    var bridge = asyncParam.bridge;
    var pnode = asyncParam.pnode;

    console.log('async: deleting bridge ' + bridge + ' on pnode ' + pnode);

    var cmd = util.format('ssh root@%s ovs-vsctl del-br \'%s\'', pnode, bridge);
    if (utilities.exec(cmd) != 0) {
        asyncParam.failed = true;
    }

    callback(err, asyncParam);
}

// async function:
//
// delete vnet
//
// asyncParam: object with attributes: rpcClient, vnet, vnetId
// callback err = null,
//          param: asyncParam. On error attribute/value failed : true is added
//
function oneVnetDeleteAsync(asyncParam, callback) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var vnetId = asyncParam.vnetId;
    var vnet = asyncParam.vnet;

    if (!vnetId) {
        console.log('async: no id for vnet ' + vnet + '. Ignore delete request');
        callback(err, asyncParam);
        return;
    }

    console.log('async: deleting vnet ' + vnet);

    var methodName = 'one.vn.delete';
    var rpcParam = [setup.getSessionString(), vnetId];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        callback(err, asyncParam);
    });
}


// async function:
//
// delete vm
//
// asyncParam: object with attributes: rpcClient,vm,vmId
// callback err = null,
//          param: asyncParam. On error attribute/value failed : true is added
//
function oneVmDeleteAsync(asyncParam, callback) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var vm = asyncParam.vm;
    var vmId = asyncParam.vmId;

    if (!vmId) {
        console.log('async: no id for vm ' + vm + '. Ignore delete request');
        callback(err, asyncParam);
        return;
    }

    console.log('async: deleting vm ' + vm);

    var methodName = 'one.vm.action';
    var rpcParam = [setup.getSessionString(), 'delete', vmId];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        function vmDeletedAction(asyncParam, callback) {
            var err = null;
            callback(err, asyncParam);
        }

        asyncParam.vmId = vmId;
        asyncParam.state = setup.VM_STATE.DONE;
        setup.vmAwaitStateAsync(asyncParam, vmDeletedAction, callback, false);
    });
}

// async function:
//
// delete image
//
// asyncParam: object with attributes: rpcClient, image,imageId
// callback err = null,
//          param: asyncParam. On error attribute/value failed : true is added
//
function oneImageDeleteAsync(asyncParam, callback) {

    var err = null;
    var rpcClient = asyncParam.rpcClient;
    var image = asyncParam.image;
    var imageId = asyncParam.imageId;

    if (!imageId) {
        console.log('async: no id for image ' + image + '. Ignore delete request');
        callback(err, asyncParam);
        return;
    }

    console.log('async: deleting image ' + image);

    var methodName = 'one.image.delete';
    var rpcParam = [setup.getSessionString(), imageId];
    console.log('async: calling ' + methodName + ', param: ' + ['********'].concat(rpcParam.slice(1)));
    rpcClient.methodCall(methodName, rpcParam, function (error, value) {
        if (error) {
            console.error('async: ' + methodName + ' failed: ' + error);
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }
        if (!value || value[0] === false) {
            // command failed
            console.error('async: ' + methodName + ' failed: error code ' + value[2] + ', ' + value[1]);
            asyncParam.failed = true;
            callback(err, asyncParam);
            return;
        }

        // call succeeded
        console.log('async: ' + methodName + ' succeeded');

        callback(err, asyncParam);
    });
}

//
//
//
//
function finalCallbackAsync(err, asyncParam) {

    console.log('async: final callback called');
    if (err) {
        console.log('CLEANUP failed');
        process.exit(1);
    }

    if (asyncParam && asyncParam.failed) {
        console.log('CLEANUP failed: not all resources could be deleted');
        process.exit(1);
    }

    console.log('CLEANUP SUCCEEDED');
}

//
//
//
//
function doCleanup(jsonData, oneAuthPath, deleteVnets, deleteImages, deleteVms) {

    var json = jsonData;

    /*
     if (!deleteImages && ! deleteVnets && ! deleteVms){
     console.log('nothing to do');
     return;
     }
     */

    if (!setup.storeSessionString(oneAuthPath)) {
        process.exit(1);
    }

    // create the xml-rpc client
    var rpcClient = setup.createRpcClient();


    var asyncFunctions = [];

    // add a function at the beginning of the function chain (the 1st function is not passed any parameters)
    function firstAsync(callback) {
        console.log('async: initialize async waterfall function chain');
        var err = null;
        callback(err, null);
    }

    asyncFunctions.push(firstAsync);

    // async function
    // 'Returns' rpcClient via callback
    // asyncParam: not used
    // callback err = null,
    //          param: object with attributes: rpcClient
    //
    function passRpcClientParamsAsync(asyncParam, callback) {
        console.log('async: pass rpcClient');
        var err = null;
        callback(err, {rpcClient: rpcClient});
    }

    // get id/name of the existing vnets
    asyncFunctions.push(passRpcClientParamsAsync);
    asyncFunctions.push(setup.getVnetsInfo);
    // store the returned data
    asyncFunctions.push(storeVnetsInfo);

    // get id/name/state of the existing images
    asyncFunctions.push(passRpcClientParamsAsync);
    asyncFunctions.push(setup.getImagesInfo);
    // store the returned data
    asyncFunctions.push(storeImagesInfo);

    // get id/name of the existing hosts
    asyncFunctions.push(passRpcClientParamsAsync);
    asyncFunctions.push(setup.getHostsInfo);
    // store the returned data
    asyncFunctions.push(storeHostsInfo);

    // get id/name/state of the existing vms
    asyncFunctions.push(passRpcClientParamsAsync);
    asyncFunctions.push(setup.getVmsInfo);
    // store the returned data
    asyncFunctions.push(storeVmsInfo);


        if (json.hasOwnProperty('segment')) {
            json.segment.forEach(function (segment) {


                // handle hosts
                if (segment.hasOwnProperty('host')) {

                    segment.host.forEach(function (host) {

                        // async function
                        // 'Returns' rpcClient,vm via callback
                        // asyncParam: not used
                        // callback err = null,
                        //          param: object with attributes: rpcClient,vm
                        //
                        function iterateDeleteOneVmHostAsync(asyncParam, callback) {
                            console.log('async: iterate delete onevm for host ' + host.label);
                            if (!asyncParam) {
                                asyncParam = {};
                            }
                            var err = null;
                            var vm = host.label;
                            var vmId;
                            var vmInfo = onevmsInfo[vm];

                            if (vmInfo && (deleteVms || vmInfo.state == setup.VM_STATE.FAILED)) {
                                vmId = vmInfo.id;
                            }
                            asyncParam.rpcClient = rpcClient;
                            asyncParam.vm = vm;
                            asyncParam.vmId = vmId;
                            callback(err, asyncParam);
                        }

                        // push the delete onevm iterator function which passes the correct parameters
                        asyncFunctions.push(iterateDeleteOneVmHostAsync);

                        // push delete onevm function for each host
                        asyncFunctions.push(oneVmDeleteAsync);
                    });
                }

                // handle gateways

                if (segment.hasOwnProperty('gateway')) {


                    segment.gateway.forEach(function (gateway) {

                        // async function
                        // 'Returns' rpcClient,vm via callback
                        // asyncParam: not used
                        // callback err = null,
                        //          param: object with attributes: rpcClient,vm
                        //
                        function iterateDeleteOneVmGatewayAsync(asyncParam, callback) {
                            console.log('async: iterate delete onevm for gateway ' + gateway.label);
                            if (!asyncParam) {
                                asyncParam = {};
                            }
                            var err = null;
                            var vm = gateway.label;
                            var vmId;
                            var vmInfo = onevmsInfo[vm];
                            if (vmInfo) {
                                vmId = vmInfo.id;
                            }
                            asyncParam.rpcClient = rpcClient;
                            asyncParam.vm = vm;
                            asyncParam.vmId = vmId;
                            callback(err, asyncParam);
                        }

                        // push the delete onevm iterator function which passes the correct parameters
                        asyncFunctions.push(iterateDeleteOneVmGatewayAsync);

                        // push delete onevm function for each gateway
                        asyncFunctions.push(oneVmDeleteAsync);
                    });
                }
            });
        }

    if (deleteImages) {

        if (json.hasOwnProperty('segment')) {

            json.segment.forEach(function (segment) {

                // handle hosts
                if (segment.hasOwnProperty('host')) {

                    segment.host.forEach(function (host) {

                        // async function
                        // 'Returns' rpcClient,image via callback
                        // asyncParam: not used
                        // callback err = null,
                        //          param: object with attributes: rpcClient,image
                        //
                        function iterateDeleteOneImageHostAsync(asyncParam, callback) {
                            console.log('async: iterate delete oneimage for host ' + host.label);
                            if (!asyncParam) {
                                asyncParam = {};
                            }
                            var err = null;
                            var image = host.label;
                            var imageId;
                            var imageInfo = oneimagesInfo[image];
                            if (imageInfo) {
                                imageId = imageInfo.id;
                            }
                            asyncParam.rpcClient = rpcClient;
                            asyncParam.image = image;
                            asyncParam.imageId = imageId;
                            callback(err, asyncParam);
                        }

                        // push the delete oneimage iterator function which passes the correct parameters
                        asyncFunctions.push(iterateDeleteOneImageHostAsync);
                        //push the delete oneimage function
                        asyncFunctions.push(oneImageDeleteAsync);
                    });

                }

                // handle gateways
                if (segment.hasOwnProperty('gateway')) {


                    segment.gateway.forEach(function (gateway) {

                        // async function
                        // 'Returns' rpcClient,image via callback
                        // asyncParam: not used
                        // callback err = null,
                        //          param: object with attributes: rpcClient,image
                        //
                        function iterateDeleteOneImageGatewayAsync(asyncParam, callback) {
                            console.log('async: iterate delete oneimage for host ' + gateway.label);
                            if (!asyncParam) {
                                asyncParam = {};
                            }
                            var err = null;
                            var image = gateway.label;
                            var imageId;
                            var imageInfo = oneimagesInfo[image];
                            if (imageInfo) {
                                imageId = imageInfo.id;
                            }
                            asyncParam.rpcClient = rpcClient;
                            asyncParam.image = image;
                            asyncParam.imageId = imageId;
                            callback(err, asyncParam);
                        }

                        // push the delete oneimage iterator function which passes the correct parameters
                        asyncFunctions.push(iterateDeleteOneImageGatewayAsync);
                        //push the delete oneimage function
                        asyncFunctions.push(oneImageDeleteAsync);
                    });
                }
            });
        }
    }
    if (deleteVnets) {
        if (json.hasOwnProperty('segment')) {

            json.segment.forEach(function (segment) {
                if (segment.hasOwnProperty('pnode')) {
                    segment.pnode.forEach(function (pnode) {

                        // async function
                        // 'Returns' bridge,pnode via callback
                        // asyncParam: not used
                        // callback err = null,
                        //          param: object with attributes: bridge,pnode
                        //
                        function iterateDeleteBridgeAsync(asyncParam, callback) {
                            console.log('async: iterate delete bridge');
                            if (!asyncParam) {
                                asyncParam = {};
                            }

                            var err = null;
                            asyncParam.bridge = segment.ovswitch;
                            asyncParam.pnode = pnode;
                            callback(err, asyncParam);
                        }

                        // push the delete bridge iterator function which passes the correct parameters
                        asyncFunctions.push(iterateDeleteBridgeAsync);

                        // push the deleteBridgeAsync function for each segment and pnode.
                        asyncFunctions.push(deleteBridgeAsync);
                    });
                }
            });


            json.segment.forEach(function (segment) {

                // async function
                // 'Returns' rpcClient,vnet via callback
                // asyncParam: not used
                // callback err = null,
                //          param: object with attributes: rpcClient,vnet
                //
                function iterateDeleteOneVnetAsync(asyncParam, callback) {
                    console.log('async: iterate delete onevnet');
                    if (!asyncParam) {
                        asyncParam = {};
                    }
                    var err = null;
                    var vnet = segment.label;
                    var vnetId;
                    var vnetInfo = onevnetsInfo[vnet];
                    if (vnetInfo) {
                        vnetId = vnetInfo.id;
                    }
                    asyncParam.rpcClient = rpcClient;
                    asyncParam.vnet = vnet;
                    asyncParam.vnetId = vnetId;
                    callback(err, asyncParam);
                }

                // push the delete onevnet iterator function which passes the correct parameters
                asyncFunctions.push(iterateDeleteOneVnetAsync);

                // push the oneVnetCreateAsync function for each segment.
                asyncFunctions.push(oneVnetDeleteAsync);
            });
        }
    }

    async.waterfall(asyncFunctions, finalCallbackAsync);
}

exports.doCleanup = doCleanup;
exports.deleteBridgeAsync = deleteBridgeAsync;
exports.oneVnetDeleteAsync = oneVnetDeleteAsync;
exports.oneVmDeleteAsync = oneVmDeleteAsync;
exports.oneImageDeleteAsync = oneImageDeleteAsync;