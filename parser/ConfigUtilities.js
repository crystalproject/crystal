var nmask = require('netmask').Netmask;
var randomip = require('random-ip');
var sh = require('shelljs');
var fs = require('fs');

// if this flag is true shelljs cmds are not executed, some file paths are changed from /mnt to /tmp, and so on.
// this is to test the scripts locally without the real infrastructure
var TEST_MODE = false;


//
// Checks if is null or empty.
//
//
function isNullOrEmpty(str) {
    return str == null || str === '';
}

//
// Checks if ip is in cidr's range
//
// Return: true if in range, false otherwise
//
function isIpInRange(ip, cidr) {

    try {
        var block = new nmask(cidr);

        return block.contains(ip);
    } catch (ex) {
        return false;
    }
    /*
     if (!ip || !cidr) {
     return false;
     }
     var ipStr = ip.toString();
     var cidrStr = cidr.toString();

     if (!ipStr || !cidrStr) {
     return false;
     }

     // range_check seems to accept only strings
     return range_check.in_range(ipStr, cidrStr);
     */
}

//
// Returns bitmask of cidr
// ( e.g. 10.0.0.0/12 --> 12)
//
//
function getBitmaskFromCidr(cidr) {

    try {
        var block = new nmask(cidr);
        return block.bitmask;
    } catch (ex) {
        return '';
    }
}
//
// Returns mask of cidr
// ( e.g. 10.0.0.0/12 --> 255.240.0.0)
//
//
function getMaskFromCidr(cidr) {

    try {
        var block = new nmask(cidr);
        return block.mask;
    } catch (ex) {
        return '';
    }
}

function getUnusedIpAddressInRange(cidr, ipAddresses) {
    var block = new nmask(cidr);

    for (var counter = 0; counter < block.size; counter++) {
        var rand = randomip(block.base, block.bitmask);
        if (!ipAddresses[rand]) {
            ipAddresses[rand] = rand;
            return rand;
        }
    }

    return null;
}

//
// Replaces '\n by ' '
//
// Return: converted string
//
function removeEOL(str) {
    return str.replace('\n', ' ');
}

//
// Executes a cmd with shelljs
//
// Return: exit status of command
function exec(cmd) {

    return execRet(cmd).code;
}

//
// Executes a cmd with shelljs
//
// Return: return object
function execRet(cmd) {

    console.log('shelljs: ' + cmd);

    if (TEST_MODE) {
        return {'code': 0, 'output': ''};
    } else {
        var ret = sh.exec(cmd, {silent: false});

        if (ret.code != 0) {
            console.log('\"' + cmd + '\" failed: code ' + ret.code + ': ' + ret.output);
        }

        return ret;
    }
}

function isYes(str) {
    if (typeof(str) !== 'string') {
        return false;
    }

    str = str.toLowerCase();
    return str[0] == 'y';
}

//
// Reads the content of file and returns it as string.
//
// Return: content of file on success, null otherwise
//
function readFile(fileName) {
    var content;
    try {
        content = fs.readFileSync(fileName, {'encoding': 'utf8'});
    } catch (e) {
        console.error('cannot read ' + fileName + ': ' + e);
        return null;
    }

    return content;
}


exports.isIpInRange = isIpInRange;
exports.isNullOrEmpty = isNullOrEmpty;
exports.getBitmaskFromCidr = getBitmaskFromCidr;
exports.getMaskFromCidr = getMaskFromCidr;
exports.getUnusedIpAddressInRange = getUnusedIpAddressInRange;
exports.exec = exec;
exports.execRet = execRet;
exports.removeEOL = removeEOL;
exports.readFile = readFile;
exports.isYes = isYes;

exports.TEST_MODE = TEST_MODE;