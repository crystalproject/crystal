#!/bin/bash
#
# interface configuration functions
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
  echo "${interfaces[@]}"
}

#######################################
# get ipv4 addresses
# globals:
#   none
# arguments:
#   optional: interface: interface of interest
#   optional: netmask: append netmask
#   optional: limit: (currently) return only first address
# returns:
#  list of ip addresses
#  1 on error
#######################################

get_ips() {
  if [[ -n "${1}" ]]; then
    local interface=${1}
  fi
  if [[ -n "${2}" ]]; then
    local netmask=1
  fi
  if [[ -n "${3}" ]]; then
    local limit=1
  fi

  if [[ -n "${interface}" ]]; then
    ip -4 -o addr | grep "${interface}" &>/dev/null

    if [[ "${?}" -eq 1 ]]; then
      echo "interface does not exist" >&2
      return 1
    fi

    if [[ -n "${netmask}" ]]; then
      local ips=($(ip -4 -o addr | grep "${interface}" |awk '!/^[0-9]*: ?lo|link\/ether/ {print $4}'))
    else
      local ips=($(ip -4 -o addr | grep "${interface}" |awk '!/^[0-9]*: ?lo|link\/ether/ {gsub("/", " "); print $4}'))
    fi
  else
    if [[ -n "${netmask}" ]]; then
      local ips=($(ip -4 -o addr |awk '!/^[0-9]*: ?lo|link\/ether/ {print $4}'))
    else
      local ips=($(ip -4 -o addr |awk '!/^[0-9]*: ?lo|link\/ether/ {gsub("/", " "); print $4}'))
    fi
  fi
  if [[ -n "${limit}" ]]; then
    echo "${ips[0]}"
  else
    echo "${ips[@]}"
  fi
}

#######################################
# check for valid ipv4 address
# globals:
#   none
# arguments:
#   ip: ipv4 address
# returns:
#  0 when valid
#  1 when invalid
#######################################

check_ip() {
  local  ip="${1}"
  local  ret=1

  if [[ "${ip}" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    OLDFS="${IFS}"
    IFS='.'
    ip=(${ip})
    IFS="${OLDFS}"
    [[ "${ip[0]}" -le 255 && "${ip[1]}" -le 255 && "${ip[2]}" -le 255 && "${ip[3]}" -le 255 ]]
    ret="${?}"
  fi
  echo "${ret}"
}
