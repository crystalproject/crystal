var fs = require('fs');
var os = require('os');
var path = require('path');
var util = require('util');
var mkdirp = require('mkdirp');
var validator = require('./ConfigValidator');

//
// constants
//

// usage
var USAGE = 'USAGE: node ConfigParser.js <ConfigFile> [-h]';

// end of line
var EOL = os.EOL;

// file write mode
var WRITEMODE = 'w';

// file extensions
var ONEVNET_EXT = '.onevnet';
var ONEIMAGE_EXT = '.oneimage';
var ONEVM_EXT = '.onevm';
var IMAGE_EXT = '.qcow2';
var RUNTIME_CONFIG_EXT = '.config';

// onevnet file content template
var ONEVNETTEMPLATE =
    'NAME    = \"%s\"' + EOL +
    'TYPE    = FIXED' + EOL + EOL +
    'BRIDGE  = %s' + EOL + EOL +
    '%s' + EOL;

// onevnet file lease entry template
var ONEVENETLEASETEMPLATE =
    'LEASES  = [IP=%s]' + EOL;

// oneimage file content template
var ONEIMAGETEMPLATE =
    'NAME          = \"%s\"' + EOL +
    'PATH          = %s' + EOL +
    'DESCRIPTION   = \"%s\"' + EOL;

// onevm file content template
var ONEVMTEMPLATE =
    'CONTEXT=[' + EOL +
    '  NETWORK=\"YES\" ]' + EOL +
    'CPU=\"1\"' + EOL +
    'DISK=[' + EOL +
    '  IMAGE=\"%s\",' + EOL +
    '  IMAGE_UNAME=\"oneadmin\" ]' + EOL +
    'GRAPHICS=[' + EOL +
    '  LISTEN=\"0.0.0.0\",' + EOL +
    '  TYPE=\"VNC\" ]' + EOL +
    'MEMORY=\"512\"' + EOL +
    'NIC=[' + EOL +
    '  NETWORK=\"Example\",' + EOL +
    '  NETWORK_UNAME=\"oneadmin\" ]' + EOL +
    'OS=[' + EOL +
    '  ARCH=\"x86_64\",' + EOL +
    '  GUESTOS=\"%s\" ]' + EOL;


// check the command line arguments

var args = process.argv.slice(2);

if (args.length == 0) {
    console.log(USAGE);
    process.exit(1);
}
if ('-h' == args[0]) {
    console.log(USAGE);
    process.exit();
}

var fileName = args[0];

// parse the JSON file
try {
    var fd = fs.readFileSync(fileName);
    var jsonRoot = JSON.parse(fd);
} catch (e) {
    console.error('failed to parse file \'' + fileName + '\': ' + e);
    process.exit(1);
}

// validate JSON config file
if (!ValidateConfiguration(jsonRoot)) {
    process.exit(1);
}

// write the scenario files
if (!WriteScenarioFiles(jsonRoot)) {
    process.exit(1);
}

console.log('successfully parsed ' + fileName);
process.exit();


//
// Generates the opennebula, runtime-config files from the json config file.
//
// Return: true if successful, false otherwise
//
function WriteScenarioFiles() {

    jsonRoot['segment'].forEach(function (segment) {
            if (!ProcessSegment(segment)) {
                return false;
            }
        }
    );

    return true;
}

//
// Writes onevnet file for segment and processes subsequent host and gateways.
//
// Return: true if successful, false otherwise
//
function ProcessSegment(segment) {

    try {
        // create path
        mkdirp.sync(jsonRoot['output_path']);
        var onevnetName = path.join(jsonRoot['output_path'], segment['label'] + ONEVNET_EXT);
        var onevnetFd = fs.openSync(onevnetName, WRITEMODE);

        var leases = '';

        // handle host array
        segment['host'].forEach(function (host) {

                // add LEASES entries for all ips of the hosts
                host['ip'].forEach(function (ip) {
                    leases = leases + util.format(ONEVENETLEASETEMPLATE, ip);
                });

                // handle host
                if (!ProcessHost(segment, host)) {
                    return false;
                }
            }
        );

        // handle gateway array
        if (segment.hasOwnProperty('gateway')) {
            segment['gateway'].forEach(function (gateway) {

                    // add LEASES entry for ipin of gateway
                    leases = leases + util.format(ONEVENETLEASETEMPLATE, gateway['ipin']);


                    // handle gateway
                    if (!ProcessGateway(segment, gateway)) {
                        return false;
                    }
                }
            );
        }

        // add LEASES entries for all gateways ipout address which is in range of current segment's cidr
        jsonRoot['segment'].forEach(function (segment) {
            if (segment.hasOwnProperty('gateway')) {
                segment['gateway'].forEach(function (gateway) {

                    if (validator.isInRange(gateway['ipout'], segment['net'])) {
                        leases = leases + util.format(ONEVENETLEASETEMPLATE, gateway['ipout']);
                    }
                });
            }
        });

        var onevnetStr = util.format(ONEVNETTEMPLATE, segment['label'], segment['ovswitch'], leases);
        fs.writeSync(onevnetFd, onevnetStr);

    } catch (e) {

        console.error('failed to process segment ' + segment['label'] + ': ' + e);
        return false;

    } finally {

        if (onevnetFd) {
            fs.closeSync(onevnetFd);
        }
    }

    return true;
}

//
// Write onevm, oneimage and runtime config files for host.
//
// Return: true if successful, false otherwise
//
function ProcessHost(segment, host) {

    if (!WriteOneVmFile(host['label'], host['template'])) {
        return false;
    }

    if (!WriteOneImageFile(host['label'], host['template'])) {
        return false;
    }

    try {

        // generate host's runtime config file
        var rtConfigName = path.join(jsonRoot['output_path'], host['label'] + RUNTIME_CONFIG_EXT);
        var rtConfigFd = fs.openSync(rtConfigName, WRITEMODE);
        var idx = segment['net'].indexOf('/');
        var netmask = segment['net'].substring(idx);

        // handle ip array
        host['ip'].forEach(function (ip) {
            var ipStr = util.format('IP = \"%s%s\"%s', ip, netmask, EOL);
            fs.writeSync(rtConfigFd, ipStr);
        });


        // handle service array
        if (host.hasOwnProperty('service')) {
            ProcessServices(host['service'], rtConfigFd);
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
function ProcessGateway(segment, gateway) {

    if (!WriteOneVmFile(gateway['label'], gateway['template'])) {
        return false;
    }

    if (!WriteOneImageFile(gateway['label'], gateway['template'])) {
        return false;
    }

    try {

        // generate gateway's runtime config file
        var rtConfigName = path.join(jsonRoot['output_path'], gateway['label'] + RUNTIME_CONFIG_EXT);
        var rtConfigFd = fs.openSync(rtConfigName, WRITEMODE);

        var idx = segment['net'].indexOf('/');
        var netmask = segment['net'].substring(idx);

        var ipinStr = util.format('IPIN = \"%s%s\"%s', gateway['ipin'], netmask, EOL);
        fs.writeSync(rtConfigFd, ipinStr);


        // find segment for whose cidr the gateways ipout is in range.
        jsonRoot['segment'].every(function (segment) {

            if (validator.isInRange(gateway['ipout'], segment['net'])) {
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

        var linktoStr = util.format('TRUSTNET = \"%s\"', gateway['linkto']);
        fs.writeSync(rtConfigFd, linktoStr);

        // handle service array
        if (gateway.hasOwnProperty('service')) {

            ProcessServices(gateway['service'], rtConfigFd);
        }

        // handle iptables array
        if (gateway.hasOwnProperty('iptables')) {
            gateway['iptables'].forEach(function (iptable) {
                iptabStr = util.format('IPTABLES = \"[%s, %s, \"%s\"]\"', iptable['inport'], iptable['outport'], iptable['dst']);
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
function WriteOneVmFile(label, template) {
    try {
        var imageStub = util.format('%s_%s', template, label);

        var onevmName = path.join(jsonRoot['output_path'], label + ONEVM_EXT);
        var onevmFd = fs.openSync(onevmName, WRITEMODE);
        var onevmStr = util.format(ONEVMTEMPLATE, imageStub, template);
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
function WriteOneImageFile(label, template) {
    try {
        var imageStub = util.format('%s_%s', template, label);


        var oneimageName = path.join(jsonRoot['output_path'], label + ONEIMAGE_EXT);
        var oneimageFd = fs.openSync(oneimageName, WRITEMODE);
        var imagePath = path.join(jsonRoot['base_path'], jsonRoot['image_path'], util.format('%s%s', imageStub, IMAGE_EXT));
        var oneimageStr = util.format(ONEIMAGETEMPLATE, template, imagePath, template);
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
function ProcessServices(services, rtConfigFd) {
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

//
// Validates the JSON config file.
// Return: true: configuration is valid
//         false: configuration is invalid
//
function ValidateConfiguration() {

    var ok = validator.validate(jsonRoot);

    if (!ok) {
        return false;
    }

    return true;
}



