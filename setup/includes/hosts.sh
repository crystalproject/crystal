#!/bin/bash
#
# hosts file functions for setup
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
  grep "$(hostname)" /etc/hosts
  if [[ ${?} -eq 1 ]]; then
    echo "add it"
    sed -i '/127.0.0.1/ s/$/ '"$(hostname)"'/' /etc/hosts
  fi
}

#######################################
# get the control host 
# Globals:
#   BASE_DIR
# Arguments:
#   None
# Returns:
#   hostname of the control host
#######################################

get_ctrl() {
#  local -a ctrlhost=($(grep -l "TYPE=ctrl" $(find "${BASE_DIR}/config/" -type f)))
#  ctrlhost=${ctrlhost[@]%/*}
#  echo ${ctrlhost[@]}
   local ctrlhost=$(grep -l "TYPE=ctrl" $(find "${BASE_DIR}/config/" -type f))
   echo "${ctrlhost}"
}

#######################################
# add a host to the hosts file
# Globals:
#   BASE_DIR
# Arguments:
#   ip:     ip address of the host to add
#   hostname: hostname to assoc the ip with
# Returns:
#   hostname of the control host
#######################################

add_host() {
  local newip="${1}"
  local newhostname="${2}"

  local added=0

  byip_ip=$(egrep -i "${newip}" /etc/hosts | awk '{print $1}')

  byhost_hostnames=($(egrep -i "${newhostname}" /etc/hosts | awk '{for(i=2;i<=NF;i++){printf "%s ", $i}; printf "\n"}'))

  if [[ ${byip_ip} == "${newip}" ]]; then
    for hostname in "${byip_hostnames[@]}"; do
      if [[ ${hostname} == "${newhostname}" ]]; then
        echo "WARN: requested entry already available"
        added=1
        break
      fi
    done
    if [[ ${added} -eq 0 ]]; then
      #add hostname to byip_ip's line
      sed -i "/^${byip_ip}:/ s/$/ ${newhostname}/" /etc/hosts
      added=1
    fi
  elif [[ ${#byhost_hostnames[@]} -ne 0 ]]; then

    for hostname in "${byhost_hostnames[@]}"; do
      if [[ ${hostname} == "${newhostname}" ]]; then
        echo "WARN: removing hostname from different ip to stay consistent"
        sed -i "s/\${$hostname}\(\s\|$\)/\s/g" /etc/hosts
        #TODO: check whether ip has any names left, otherwise remove it completely
      fi
    done
    # add new entry
    echo -e "${newip}\t${newhostname}" >> /etc/hosts
    added=1
  else
    # add new entry
    echo -e "${newip}\t${newhostname}" >> /etc/hosts
    added=1
  fi
}

#######################################
# remotely add a hostname to the hosts file
# Globals:
#   none
# Arguments:
#   ctrl_host: path to host config of the ctrl
# Returns:
#   0: success
#   1: failure
#######################################

remote_add_hosts() {
  if [[ -z "${host}" || -z "${PREFIX}" || -z "${1}" ]]; then
    echo "missing parameter" >&2
    return 1
  fi

  local ctrl_host="${1}"

  if [[ ! -f "${ctrl_host}" ]]; then
    echo "host not found" >&2
    return 1
  fi

  local ctrl_user=$(grep ^USER "${ctrl_host}" | cut -d '=' -f 2)
  local ctrl_ip=$(grep ^PREFIX "${ctrl_host}" | cut -d '=' -f 2)

  ssh -t "${ctrl_user}"@"${ctrl_ip%/*}" bash -c "'

    source /tmp/includes/hosts.sh

    if [[ \${?} -ne 0 ]]; then
      return 1
    fi

    if [[ \$(id -u) != 0 ]]; then
      sudo bash -c \"source /tmp/includes/hosts.sh; add_host ${PREFIX%/*} ${host}\"
    else
      add_host ${PREFIX%/*} ${host}
    fi
    '"

  if [[ ${?} -ne 0 ]]; then
    return 1
  else
    return 0
  fi

}
