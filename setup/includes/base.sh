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
#   0 on valid, otherwise exits 1
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
  return 0
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
