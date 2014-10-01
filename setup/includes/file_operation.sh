#!/bin/bash
#
# file operation functions for setup
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
# Put all files from a local directory
# structure to the root filesystem
# Globals:
#   None
# Arguments:
#   directory to relative root dir
# Returns:
#  0: on success
#  >=1: error
#######################################

put_root() {
#  for file in $(find "${1}" -type f); do
  find "${1}" -type f -print0 | while read -d $'\0' file; do
    local dest=${file##"${1}"}
    local dir=${dest%/*}

    if [ ! -d "${dir}" ]; then
      mkdir -p "${dir}"
    fi

    # check suffix file handling options
    local extension="${file##*.}"
    # TODO(pat): extend with insert

    case ${extension} in
    append)
       dest=${dest%.append}
       cat "${file}" >> "${dest}"
      ;;
    insert)
      echo "Not implemented yet" >&2
      ;;
    *)
      cp "${file}" "${dest}";
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
# add publickey from ctrl-host to the node
# Globals:
#   None
# Arguments:
#   ctrl_host: hostname of ctrl host
# Returns:
#  0: on success
#  1: error
#######################################

distribute_pubkey() {
  if [[ ${#} -lt 1 ]]; then
    return 1
  fi

  local ctrl_host="${1}"
  local ctrl_user=$(grep ^USER "${ctrl_host}" | cut -d '=' -f 2)
  local ctrl_ip=$(grep ^PREFIX "${ctrl_host}" | cut -d '=' -f 2)

  scp -3 "${ctrl_user}"@"${ctrl_ip%/*}":/var/lib/one/.ssh/id_rsa.pub "${USER}"@"${PREFIX%/*}":/tmp/id_rsa.pub

  ssh -t "${USER}"@"${PREFIX%/*}" bash -c "'if [[ \$(id -u) != 0 ]];
                        then sudo bash -c \"cat /tmp/id_rsa.pub >> /var/lib/one/.ssh/authorized_keys\"
                else
                        cat /tmp/id_rsa.pub >> /var/lib/one/.ssh/authorized_keys
                fi;
        '"

  if [[ ${?} -ne 0 ]]; then
    return 1
  else
    return 0
  fi
}
