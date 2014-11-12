var fs = require('fs');
var os = require('os');
var path = require('path');
var util = require('util');
var mkdirp = require('mkdirp');


var validator = require('./ConfigValidator');


// end of line
var EOL = os.EOL;

// file write mode
var FILEFLAG = 'w';

// file extensions
var ONEVNET_EXT = '.onevnet';
var ONEIMAGE_EXT = '.oneimage';
var ONEVM_EXT = '.onevm';
var IMAGE_EXT = '.qcow2';
var RUNTIME_CONFIG_EXT = '.config';
var DEPLOYMENT_PLAN_FILENAME = 'deployment_plan';

// onevnet file content template
var ONEVNETTEMPLATE =
    'NAME    = \"%s\"' + EOL +
    'TYPE    = FIXED' + EOL + EOL +
    'BRIDGE  = %s' + EOL + EOL +
    'NETWORK_ADDRESS  = %s' + EOL + EOL +
    '%s' + EOL;

// onevnet file lease entry template
var ONEVENETLEASETEMPLATE =
    'LEASES  = [IP=%s]' + EOL;

// oneimage file content template
var ONEIMAGETEMPLATE =
    'NAME          = \"%s\"' + EOL +
    'PATH          = %s' + EOL +
    'DESCRIPTION   = \"%s\"' + EOL;

// onevm file NIC entry template
var ONEVMNICTEMPLLATE =
    'NIC=[' + EOL +
    '  NETWORK=\"%s\",' + EOL +
    '  NETWORK_UNAME=\"oneadmin\" ]' + EOL;

// onevm file content template
var ONEVMTEMPLATE =
    'NAME=\"%s\"' + EOL +
    'CONTEXT=[' + EOL +
    '  NETWORK=\"YES\" ]' + EOL +
    'CPU=\"1\"' + EOL +
    'DISK=[' + EOL +
    '  DEV_PREFIX=\"vd\",' + EOL +
    '  IMAGE=\"%s\",' + EOL +
    '  IMAGE_UNAME=\"oneadmin\" ]' + EOL +
    'GRAPHICS=[' + EOL +
    '  LISTEN=\"0.0.0.0\",' + EOL +
    '  TYPE=\"VNC\" ]' + EOL +
    'INPUT=[BUS=\"usb\",TYPE=\"tablet\"]' + EOL +
    'MEMORY=\"%s\"' + EOL +
    'RAW=[DATA=\"<devices><video><model type=\'vmvga\' /></video></devices>\",TYPE=\"kvm\"]' + EOL +
    'OS=[' + EOL +
    '  ARCH=\"%s\",' + EOL +
    '  GUESTOS=\"%s\" ]' + EOL +
    '%s' + EOL;


var json;
//
// Generates the opennebula, runtime-config files from the json config file.
//
// Return: true if successful, false otherwise
//
function writeScenarioFiles(jsonData) {

    var status = true;

    try {

        json = jsonData;
        // create output_path
        mkdirp.sync(json['output_path']);

        // create the deployment plan file
        var deploymentPlanName = path.join(json['output_path'], DEPLOYMENT_PLAN_FILENAME);
        var deployFd = fs.openSync(deploymentPlanName, FILEFLAG);


        json['segment'].every(function (segment) {
                if (!processSegment(segment, deployFd)) {
                    status = false;
                }
                return status;
            }
        );

    } catch (e) {
        console.error('failed to process deployment plan: ' + e);
        status = false;
    } finally {
        if (deployFd) {
            fs.closeSync(deployFd);
        }
    }

    return status;
}

//
// Writes onevnet file for segment and processes subsequent host and gateways.
//
// Return: true if successful, false otherwise
//
function processSegment(segment, deployFd) {

    var status = true;
    try {

        var onevnetName = path.join(json['output_path'], segment['label'] + ONEVNET_EXT);
        var onevnetFd = fs.openSync(onevnetName, FILEFLAG);


        var leases = '';

        // handle host array
        if (segment.hasOwnProperty('host')) {
            segment['host'].every(function (host) {
                    // handle host
                    if (!processHost(segment, host, deployFd)) {
                        status = false;
                    }
                    return status;
                }
            );
        }

        if (!status) {
            return status;
        }
        // handle gateway array
        if (segment.hasOwnProperty('gateway')) {
            segment['gateway'].every(function (gateway) {

                    // add LEASES entry for ipin of gateway
                    leases = leases + util.format(ONEVENETLEASETEMPLATE, gateway['ipin']);


                    // handle gateway
                    if (!processGateway(segment, gateway, deployFd)) {
                        status = false;
                    }

                    return status;
                }
            );
        }

        if (!status) {
            return status;
        }

        // add LEASES entries for all host's ips which are in range of current segment's cidr
        json['segment'].forEach(function (seg) {
            if (seg.hasOwnProperty('host')) {
                seg['host'].forEach(function (host) {
                    if (host.hasOwnProperty('ip')) {
                        host['ip'].forEach(function (ip) {
                            if (validator.isIpInRange(ip, segment['net'])) {
                                leases = leases + util.format(ONEVENETLEASETEMPLATE, ip);
                            }
                        });
                    }
                });
            }
        });

        // add LEASES entries for all gateway's ipout address which is in range of current segment's cidr
        json['segment'].forEach(function (seg) {
            if (seg.hasOwnProperty('gateway')) {
                seg['gateway'].forEach(function (gateway) {

                    if (validator.isIpInRange(gateway['ipout'], segment['net'])) {
                        leases = leases + util.format(ONEVENETLEASETEMPLATE, gateway['ipout']);
                    }
                });
            }
        });

        var onevnetStr = util.format(ONEVNETTEMPLATE, segment['label'], segment['ovswitch'], segment['net'], leases);
        fs.writeSync(onevnetFd, onevnetStr);


        segmentToDeploymentPlan(segment, deployFd);

    } catch (e) {

        console.error('failed to process segment ' + segment['label'] + ': ' + e);
        return false;

    } finally {

        if (onevnetFd) {
            fs.closeSync(onevnetFd);
        }
    }

    return status;
}

//
// Writes the segment's data to the deployment plan file.
//
//
//
function segmentToDeploymentPlan(segment, deployFd) {

    // write segment label
    var segStr = util.format('[SEGMENT = \"%s\"]%s', segment['label'], EOL);
    fs.writeSync(deployFd, segStr);
    segment['pnode'].forEach(function (pnode) {
        // write pnode
        var nodeStr = util.format('\tNODE = [\"%s\"]%s', pnode, EOL);
        fs.writeSync(deployFd, nodeStr);

        // write hosts and gateways belonging to this physical node (pnode)
        if (segment.hasOwnProperty('host')) {
            segment['host'].forEach(function (host) {
                if (pnodeMatches(pnode, host['pnode'])) {
                    var hostStr = util.format('\t\tHOST = [\"%s\"]%s', host['label'], EOL);
                    fs.writeSync(deployFd, hostStr);
                }
            });
        }

        if (segment.hasOwnProperty('gateway')) {
            segment['gateway'].forEach(function (gateway) {
                if (pnodeMatches(pnode, gateway['pnode'])) {
                    var hostStr = util.format('\t\tHOST = [\"%s\"]%s', gateway['label'], EOL);
                    fs.writeSync(deployFd, hostStr);
                }
            });
        }
    });
}

//
// Checks if host pnode matches the segment's pnode
//
//
function pnodeMatches(segmentPnode, hostPnode) {

    if (validator.isNullOrEmpty(hostPnode)) {
        // host pnode not set, so the segment's pnode matches
        return true;
    }

    // we have a match if the two pnodes are equal.
    return segmentPnode === hostPnode;
}

//
// Write onevm, oneimage and runtime config files for host.
//
// Return: true if successful, false otherwise
//
function processHost(segment, host) {

    var nics = '';
    var networks = {};

    // make a NIC entry for each segment's cidr the host's ips match (only one entry per segment's cidr)
    if (host.hasOwnProperty('ip')) {
        host['ip'].forEach(function (ip) {
            if (json.hasOwnProperty('segment')) {
                json['segment'].forEach(function (seg) {
                    if (validator.isIpInRange(ip, seg['net'])) {
                        if (!networks[seg['net']]) {
                            networks[seg['net']] = seg['net'];
                            nics = nics + util.format(ONEVMNICTEMPLLATE, seg['label']);
                        }
                    }
                });
            }
        });
    }

    if (!writeOneVmFile(host['label'], host['os'], host['architecture'], host['memory'], nics)) {
        return false;
    }

    if (!writeOneImageFile(host['label'], host['os'])) {
        return false;
    }

    try {

        // generate host's runtime config file
        var rtConfigName = path.join(json['output_path'], host['label'] + RUNTIME_CONFIG_EXT);
        var rtConfigFd = fs.openSync(rtConfigName, FILEFLAG);
        var idx = segment['net'].indexOf('/');
        var netmask = segment['net'].substring(idx);

        // handle ip array
        host['ip'].forEach(function (ip) {
            var ipStr = util.format('IP = \"%s%s\"%s', ip, netmask, EOL);
            fs.writeSync(rtConfigFd, ipStr);
        });


        // handle service array
        if (host.hasOwnProperty('service')) {
            processServices(host['service'], rtConfigFd);
        }

    } catch (e) {
        console.error('failed to write runtime config file for: ' + host['label'] + ': ' + e);
        return false;

    } finally {
        if (rtConfigFd) {
            fs.closeSync(rtConfigFd);
        }
    }

    return true;
}


//
// Write onevm, oneimage and runtime config files for gateway.
//
// Return: true if successful, false otherwise
//
function processGateway(segment, gateway) {

    var nics = '';
    var networks = {};

    if (json.hasOwnProperty('segment')) {
        json['segment'].forEach(function (seg) {

            if (validator.isIpInRange(gateway['ipin'], seg['net'])) {
                if (!networks[seg['net']]) {
                    networks[seg['net']] = seg['net'];
                    nics = nics + util.format(ONEVMNICTEMPLLATE, seg['label']);
                }
            }
            if (validator.isIpInRange(gateway['ipout'], seg['net'])) {
                if (!networks[seg['net']]) {
                    networks[seg['net']] = seg['net'];
                    nics = nics + util.format(ONEVMNICTEMPLLATE, seg['label']);
                }
            }
        });
    }

    if (!writeOneVmFile(gateway['label'], gateway['os'], gateway['architecture'], gateway['memory'], nics)) {
        return false;
    }

    if (!writeOneImageFile(gateway['label'], gateway['template'])) {
        return false;
    }

    try {

        // generate gateway's runtime config file
        var rtConfigName = path.join(json['output_path'], gateway['label'] + RUNTIME_CONFIG_EXT);
        var rtConfigFd = fs.openSync(rtConfigName, FILEFLAG);

        var idx = segment['net'].indexOf('/');
        var netmask = segment['net'].substring(idx);

        var ipinStr = util.format('IPIN = \"%s%s\"%s', gateway['ipin'], netmask, EOL);
        fs.writeSync(rtConfigFd, ipinStr);


        // find segment for whose cidr the gateway's ipout is in range.
        json['segment'].every(function (segment) {

            if (validator.isIpInRange(gateway['ipout'], segment['net'])) {
                var idx = segment['net'].indexOf('/');
                var netmask = segment['net'].substring(idx);
                var ipoutStr = util.format('IPOUT = \"%s%s\"%s', gateway['ipout'], netmask, EOL);
                fs.writeSync(rtConfigFd, ipoutStr);
                // found the segment, stop iterating through the segments
                return false;
            } else {
                return true;
            }
        });

        var linktoStr = util.format('TRUSTNET = \"%s\"%s', gateway['linkto'], EOL);
        fs.writeSync(rtConfigFd, linktoStr);

        // handle service array
        if (gateway.hasOwnProperty('service')) {

            processServices(gateway['service'], rtConfigFd);
        }

        // handle iptables array
        if (gateway.hasOwnProperty('iptables')) {
            gateway['iptables'].forEach(function (iptable) {
                iptabStr = util.format('IPTABLES = \"[%s, %s, \"%s\"]\"%s', iptable['inport'], iptable['outport'], iptable['dst'], EOL);
                fs.writeSync(rtConfigFd, iptabStr);

            });
        }
    }

    catch
        (e) {
        console.error('failed to write runtime config file for: ' + gateway['label'] + ': ' + e);
        return false;

    }
    finally {
        if (rtConfigFd) {
            fs.closeSync(rtConfigFd);
        }
    }

    return true;
}

//
// Writes onevm file.
//
// Return: true if successful, false otherwise
//
function writeOneVmFile(label, os, arch, memory, nics) {
    try {
        var imageStub = util.format('%s_%s', os, label);

        var onevmName = path.join(json['output_path'], label + ONEVM_EXT);
        var onevmFd = fs.openSync(onevmName, FILEFLAG);
        var onevmStr = util.format(ONEVMTEMPLATE, label, label, memory, arch, os, nics);
        fs.writeSync(onevmFd, onevmStr);

    } catch (e) {
        console.error('failed to write onevm file for: ' + label + ': ' + e);
        return false;

    } finally {
        if (onevmFd) {
            fs.closeSync(onevmFd);
        }
    }

    return true;
}

//
// Writes onimage file
//
// Return: true if successful, false otherwise
//
function writeOneImageFile(label, os) {
    try {
        var imageStub = util.format('%s_%s', os, label);

        var oneimageName = path.join(json['output_path'], label + ONEIMAGE_EXT);
        var oneimageFd = fs.openSync(oneimageName, FILEFLAG);
        var imagePath = path.join(json['base_path'], json['image_path'], util.format('%s%s', imageStub, IMAGE_EXT));
        var oneimageStr = util.format(ONEIMAGETEMPLATE, label, imagePath, os);
        fs.writeSync(oneimageFd, oneimageStr);

    } catch (e) {
        console.error('failed to write oneimage file for: ' + label + ': ' + e);
        return false;

    } finally {
        if (oneimageFd) {
            fs.closeSync(oneimageFd);
        }
    }

    return true;
}

//
// Writes service data to runtime config file.
//
// Return: true if successful, false otherwise
//
function processServices(services, rtConfigFd) {
    services.forEach(function (service) {
        var serviceStr = util.format('SERVICE = \"%s\"%s', service['label'], EOL);
        fs.writeSync(rtConfigFd, serviceStr);

        // handle serviceconf array
        if (service.hasOwnProperty('serviceconf')) {
            var serviceConf = service['serviceconf'];
            serviceConf.forEach(function (items) {
                Object.keys(items).forEach(function (key) {
                    var confStr = util.format('CONFIG = \"[%s = %s]\"%s', key, items[key], EOL);
                    fs.writeSync(rtConfigFd, confStr);
                });
            });
        }
    });
}

exports.writeScenarioFiles = writeScenarioFiles;
exports.ONEVM_EXT = ONEVM_EXT;
exports.ONEVNET_EXT = ONEVNET_EXT;
