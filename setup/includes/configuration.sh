#!/bin/bash
#
# configuration functions for setup
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
# along with crystalproject.  If not, see <http://www.gnu.org/licenses/>

#######################################
# set configuration options as
# variables
# Globals:
#   BASE_DIR
# Arguments:
#   file to read (equal to hostname)
# Returns:
#   none
#######################################

config_parse() {
  exec 4< "${BASE_DIR}/config/${1}"
  while read -u 4 line; do
    local setting=$(echo "${line}" | cut -d '=' -f 1)
    local value=$(echo "${line}" | cut -d '=' -f 2)
    eval "${setting}"="${value}"
  done
}


#######################################
# check configuration files
# conditions are:
#   - ip addresses assigned once
#   - only one ctrl host defined
# variables
# Globals:
#   BASE_DIR
# Arguments:
#   none
# Returns:
#  0 on valid
#  1 on invalid
#######################################

config_check() {
  local -a files=( $(find "${BASE_DIR}/config" -type f) )
  local -a ips

  local num_ctrl=$(grep -o "TYPE=ctrl" "${files[@]}"| wc -l)

  if [[ "${num_ctrl}" -ne 1 ]]; then
    echo "you have to declare exactly one control host" >&2
    return 0
  fi

  for file in "${files[@]}"; do
    local ip=$(grep ^PREFIX "${file}" | cut -d '=' -f 2)
    local greip=$(grep ^MPGREPREFIX "${file}" | cut -d '=' -f 2)
    ip=${ip%/*}
    greip=${greip%/*}

    if [[ -n ${ip} ]]; then
      ips+=(${ip})
    fi

    if [[ -n ${greip} ]]; then
      ips+=(${greip})
    fi

    ip=""
    greip=""
  done

  local num_uniq=$(echo "${ips[@]}" | tr ' ' '\n' | sort | uniq | wc -l )

  if [[ ${num_uniq} -ne ${#ips[@]} ]]; then
    echo "there are inconsistencies in the configuration. please double check" >&2
    return 1
  fi
}

#######################################
# add configuration item
# Globals:
#   BASE_DIR
# Arguments:
#   host:       the hostname
#   type:       type (either ctrl or node)
#   cidr ip/nm: ip address/netmask of the system
#   user:       user to login via ssh
#   gre cidr ip/nm: ip address/netmask for the mpgre config
#    
# Returns:
#  0 on success, otherwise >=1
#######################################

config_add() {
  if [[ ${#} -ne 5 ]]; then
    return 2
  fi

  local host=$(echo "${1}" |tr '[:upper:]' '[:lower:]')
  local ip=${3%/*}
  local nm=${3##*/}
  local greip=${5%/*}
  local grenm=${5##*/}

  # host should not exist
  if [[ ! -f "${BASE_DIR}/config/${host}" ]]; then
    # type either ctrl or node
    if [[ "${2}" == "ctrl" || "${2}" == "node" ]]; then
      if [[ "${nm}" =~ ^[0-9]+$ ]]; then
        if [[ $(check_ip "${ip}") -eq 0 && "${nm}" -le 32 ]]; then
          if [[ "${nm}" =~ ^[0-9]+$ ]]; then
            if [[ $(check_ip "${greip}") -eq 0 && "${grenm}" -le 32 ]]; then
              echo -e "TYPE=${2}\nPREFIX=${3}\nUSER=${4}\nMPGREPREFIX=${5}" > "${BASE_DIR}/config/${host}"
            else
              echo "gre ip addr has to be in cidr format" >&2
              return 1
            fi
          else
            echo "gre ip addr has to be in cidr format" >&2
            return 1
          fi
        else
          echo "ip addr has to be in cidr format" >&2
          return 1
        fi
      else
        echo "ip addr has to be in cidr format" >&2
        return 1
      fi
    else
      echo "type has to be either ctrl (opennebula control host) or node (additional node)" >&2
      return 1
    fi
  else
    echo "host already exists" >&2
    return 1
  fi
}

#######################################
# Check distribution
# Globals:
#   BASE_DIR
# Arguments:
#   host:   the hostname
# Returns:
#   0 on success, otherwise >=1
#######################################

config_del() {
  if [[ ${#} -lt 1 ]]; then
    return 2
  fi

  local host=$(echo "${1}" |tr '[:upper:]' '[:lower:]')

  if [[ -f "${BASE_DIR}/config/${host}" ]]; then
    rm "${BASE_DIR}/config/${host}"
    echo "removed"
  else
    echo "host does not exist" >&2
    return 1
  fi
}
