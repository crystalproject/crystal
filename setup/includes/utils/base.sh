#!/bin/bash
#
# Base utils for installation
#
# Copyright (C) 2014 RUAG Defence, Patrick Haeusermann <patrick.haeusermann@ruag.com>
#
# This file is part of crystalproject
#
# crystalproject is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License version 3 as published by
# the Free Software Foundation.
#
#
# crystalproject is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with crystalproject.  If not, see <http://www.gnu.org/licenses/>.

#######################################
# Check distribution
# Globals:
#   None
# Arguments:
#   None
# Returns:
#   1 on valid, otherwise 0
#######################################

distribution() {
  if [[ $(hash lsb_release 2> /dev/null) ]]; then
    echo "Non-compliant distribution" >&2
    exit 1
  fi
  local distribution=$(lsb_release -sir)
  if [[ "${?}" -ne 0 || ! "$distribution" =~ ^Ubuntu.14.04$ ]]; then
    echo "Non-compliant distribution" >&2
    exit 1
  fi
  echo 1
}


#######################################
# Check administration privileges
# TODO: gain root if not
# Globals:
#   None
# Arguments:
#   None
# Returns:
#   1 on valid, otherwise 0
#######################################

root() {
  if [[ ${EUID} -ne 0 ]]; then
    echo "This script must be run as root" >&2
    exit 1
  fi
  echo 1
}

#######################################
# Install through apt
# Globals:
#   None
# Arguments:
#   path to pkglist
# Returns:
#  0: on success
#  >=1: error
#######################################

inst_apt() {
  local file=$1

  if [[ $(hash apt-get) ]]; then
   echo "apt seems not to be available on your system" >&2
   exit 1
  fi

  local OLDFS=$IFS;
  IFS=$'\r\n'

  local pkgs=$(<${file})
  IFS=$OLDFS

  apt-get -y install ${pkgs[*]}

  echo $?
}

#######################################
# Install through local deb
# Globals:
#   None
# Arguments:
#  path to one or more debfile(s)
#  OR directory containing debfiles
# Returns:
#  0: on success
#  >=1: error
#######################################

inst_deb() {
  if [[ $(hash dpkg) ]]; then
    echo "dpkg seems not to be available on your system" >&2
    exit 1
  fi

  if [[ -d ${1} ]]; then
    dpkg -REi "${1}"
  else
    dpkg -Ei "${@}"
  fi
  echo $?
}

#######################################
# Put files in place
# Globals:
#   None
# Arguments:
#   directory to relative root dir
# Returns:
#  0: on success
#  >=1: error
#######################################

put_files() {
  for file in $(find "${1}" -type f); do
    local dest=${file##"${1}"}
    local dir=${dest%/*}

    if [ ! -d ${dir} ]; then
      mkdir -p ${dir}
    fi

    # check suffix file handling options
    local extension="${file##*.}"
    # TODO(pat): extend with insert

    case ${extension} in
    append)
       dest=${dest%.append}
       cat ${file} >> ${dest}
      ;;
    insert)
      echo "Not implemented yet" >&2
      ;;
    *)
      cp ${file} ${dest};
      ;;
    esac

    if [[ $? -ne 0 ]]; then
      echo "error: ${file} => ${dest}"
    else
      echo "${file} => ${dest}"
    fi
  done
}

#######################################
# Get active Interfaces
# Globals:
#   None
# Arguments:
#   None
# Returns:
#  list of possible interfaces
#######################################

get_intf() {
  local interfaces=($(ip l|grep "^[[:digit:]]"|egrep -v "lo|DOWN|DORMANT|UNKNOWN"|awk '{print $2}'|tr -d :| cut -d'@' -f1))
  echo ${interfaces[@]}
}

#######################################
# Get IPv4 addresses
# Globals:
#   None
# Arguments:
#   optional: interface: interface of interest
#   optional: netmask: append netmask
#   optional: limit: (currently) return only first address
# Returns:
#  list of ip addresses
#######################################

get_ips() {
  if [[ -n ${1} ]]; then
    local interface=${1}
  fi
  if [[ -n ${2} ]]; then
    local netmask=1
  fi
  if [[ -n ${3} ]]; then
    local limit=1
  fi

  if [[ -n ${interface} ]]; then
    # TODO(pat): check if interface does exist!
    if [[ -n ${netmask} ]]; then
      local ips=($(ip -4 -o addr | grep ${interface} |awk '!/^[0-9]*: ?lo|link\/ether/ {print $4}'))
    else
      local ips=($(ip -4 -o addr | grep ${interface} |awk '!/^[0-9]*: ?lo|link\/ether/ {gsub("/", " "); print $4}'))
    fi
  else
    if [[ -n ${netmask} ]]; then
      local ips=($(ip -4 -o addr |awk '!/^[0-9]*: ?lo|link\/ether/ {print $4}'))
    else
      local ips=($(ip -4 -o addr |awk '!/^[0-9]*: ?lo|link\/ether/ {gsub("/", " "); print $4}'))
    fi
  fi
  if [[ -n ${limit} ]]; then
    echo ${ips[0]}
  else
    echo ${ips[@]}
  fi
}



#######################################
# Check if local hostname is in /etc/hosts
#  (and fix it if not)
# Globals:
#   None
# Arguments:
#   None
# Returns:
#   None
#######################################

check_local_hosts() {
  grep $(hostname) /etc/hosts
  if [[ ${?} -eq 1 ]]; then
    echo "add it"
    sed -i '/127.0.0.1/ s/$/ '$(hostname)'/' /etc/hosts
  fi
}

check_ip() {
  local  ip=${1}
  local  stat=1

  if [[ ${ip} =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    OIFS=${IFS}
    IFS='.'
    ip=(${ip})
    IFS=${OIFS}
    [[ ${ip[0]} -le 255 && ${ip[1]} -le 255 && ${ip[2]} -le 255 && ${ip[3]} -le 255 ]]
    stat=$?
  fi
  echo $stat
}

#######################################
# Replace PATTERN with REPLACE
# Globals:
#   None
# Arguments:
#   PATTERN: Pattern to replace
#   REPLACE: String with replacement
#   FILE:    File to read
#   OUTPUT:  (optional) Filename to write to
# Returns:
#   
#######################################

replace(){
  local PATTERN=${1}
  local REPLACE=${2}
  local INFILE=${3}

  if [[ -n ${4} ]]; then
    local OUTFILE=${4}
  fi

  if [[ -n ${OUTFILE} ]]; then
    sed 's/'${PATTERN}'/'${REPLACE}'/g' ${INFILE} > ${OUTFILE}
  else
    sed -i 's/'${PATTERN}'/'${REPLACE}'/g' ${INFILE}
  fi
}

parse_config() {
  exec 4< "${BASE_DIR}/config/${1}"
  while read -u 4 line; do
    local setting=$(echo "${line}" | cut -d '=' -f 1)
    local value=$(echo "${line}" | cut -d '=' -f 2)
    eval "${setting}"=${value}
  done 
}


