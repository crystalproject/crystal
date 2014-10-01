#!/bin/bash
#
# user interaction functions for setup
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
# Ask which network interface to use
# Globals:
#   None
# Arguments:
#   None
# Returns:
#   1 on valid, otherwise 0
#######################################

query_service_interface(){
  local found=0
  local interfaces=("${@}")
  if [[ ${#interfaces[@]} -ne 1 ]]; then
    while [[ ${found} -ne 1 ]]; do
      #ask interface
      echo "Available interfaces: ${interfaces[*]}" >&1
      echo -n "Which interface to use: " >&1
      read chosen
      for int in "${interfaces[@]}"; do
        if [[ "${int}" == "${chosen}" ]]; then
          found=1;
        fi
      done
      if [[ ${found} -ne 1 ]]; then
        echo "Interface not found.. try again" >&2
      fi
    done
  else
    echo ${interfaces[0]}
   #chosen_interface=${interfaces[0]}
  fi
}


approve_interfaces() {
  if [[ -z ${EDITOR} ]]; then
    local EDITOR="vi"
  fi

  while [[ "${ans_apply}" != "y" ]]; do
  ${EDITOR} "/tmp/interfaces"
  echo -n "Would you like to apply now?[N/y]: "
  read -n 1 ans_apply
  echo
  ans_apply=$(echo "${ans_apply}" |tr '[:upper:]' '[:lower:]')
  done
}
