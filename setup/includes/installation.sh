#!/bin/bash
#
# various packet installation functions
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
  local file="${1}"

  hash apt-get &>/dev/null

  if [[ "${?}" -eq 1 ]]; then
   echo "apt seems not to be available on your system" >&2
   exit 1
  fi

  local OLDFS="${IFS}"
  IFS=$'\r\n'

  local pkgs=$(<"${file}")
  IFS="${OLDFS}"

  apt-get -y install ${pkgs[@]}

  return "${?}"
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

  hash dpkg &>/dev/null

  if [[ "${?}" -eq 1 ]]; then
    echo "dpkg seems not to be available on your system" >&2
    exit 1
  fi

  if [[ -d "${1}" ]]; then
    dpkg -REi "${1}"
  else
    dpkg -Ei "${@}"
  fi
  echo "${?}"
}

#######################################
# check if package (or all pkgs from a
# pkglist file) are installed
# Globals:
#   None
# Arguments:
#  path to one or more debfile(s)
#  OR directory containing debfiles
# Returns:
#  0: on success
#  1: error
#######################################

check_deps_deb() {

  if [[ -f "${1}" ]]; then
    local file="${1}"
  elif [[ -n "${1}" ]]; then
    local pkg="${1}"
  else
    return 1
  fi

  hash dpkg
  if [[ "${?}" -eq 1 ]]; then
    echo "dpkg seems not to be available on your system" >&2
    return 1
  fi

  if [[ -n "${file}" ]]; then

    local OLDFS="${IFS}";
    IFS=$'\r\n'
  
    local pkgs=$(<"${file}")
    IFS="${OLDFS}"

    for pkg in ${pkgs}; do
      dpkg --get-selections | grep "^${pkg}" | grep -q "install$" >/dev/null
      if [[ "${?}" -eq 1 ]]; then
        echo "dependencies missing. please install ${pkg}"
        return 1
      fi
    done

  else
      dpkg --get-selections | grep "^${pkg}" | grep -q "install$" >/dev/null
      if [[ "${?}" -eq 1 ]]; then
        echo "dependency ${pkg} not installed"
        return 1
      fi
  fi

  return 0
}
