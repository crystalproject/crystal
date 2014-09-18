#!/bin/bash
#
# Deploy crystal installation
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

get_ctrl() {
#  local -a ctrlhost=($(grep -l "TYPE=ctrl" $(find "${BASE_DIR}/config/" -type f)))
#  ctrlhost=${ctrlhost[@]%/*}
#  echo ${ctrlhost[@]}
   local ctrlhost=$(grep -l "TYPE=ctrl" $(find "${BASE_DIR}/config/" -type f))
   echo ${ctrlhost}
}

add_host() {
  local newip="${1}"
  local newhostname="${2}"

  local added=0

  byip_ip=$(egrep -i "${newip}" /etc/hosts | awk '{print $1}')
# byip_hostnames=( $(egrep -i "${newip}" /etc/hosts |awk '{for(i=2;i<=NF;i++){printf "%s ", $i}; printf "\n"}') )

  byhost_ip=$(egrep -i "${newhostname}" /etc/hosts | awk '{print $1}')
  byhost_hostnames=($(egrep -i "${newhostname}" /etc/hosts | awk '{for(i=2;i<=NF;i++){printf "%s ", $i}; printf "\n"}'))

  if [[ ${byip_ip} == ${newip} ]]; then
    for hostname in ${byip_hostnames[@]}; do
      if [[ ${hostname} == ${newhostname} ]]; then
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

    for hostname in ${byhost_hostnames[@]}; do
      if [[ ${hostname} == ${newhostname} ]]; then
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
