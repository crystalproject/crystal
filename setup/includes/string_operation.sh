#!/bin/bash
#
# string operation functions for setup
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
  local PATTERN="${1}"
  local REPLACE="${2}"
  local INFILE="${3}"

  if [[ -n "${4}" ]]; then
    local OUTFILE="${4}"
  fi

  if [[ -n "${OUTFILE}" ]]; then
    sed 's/'"${PATTERN}"'/'"${REPLACE}"'/g' "${INFILE}" > "${OUTFILE}"
  else
    sed -i 's/'"${PATTERN}"'/'"${REPLACE}"'/g' "${INFILE}"
  fi
}

#######################################
# Append STRING to line matching PATTERN
#  on FILE
#
# Globals:
#   None
# Arguments:
#   FILE:    File to operate on
#   PATTERN: Pattern to match
#   STRING: String to append
# Returns:
#   0 on success
#   >=1 on err
#   
#######################################

append_line(){
  if [[ -z "${1}" || -z "${2}" || -z "${3}" || ${#} -ne 3 ]]; then
    return 1;
  fi

  local file pattern string;
  file="${1}"
  pattern="${2}"
  string="${3}"

  sed -i "/${pattern}/ s/$/\ ${string}/" "${file}"

  return ${?}
}

#######################################
# Remove STRING from line matching PATTERN
#  on FILE
#
# Globals:
#   None
# Arguments:
#   FILE:    File to operate on
#   PATTERN: Pattern to match
#   STRING: String to delete
# Returns:
#   0 on success
#   >=1 on err
#   
#######################################

delete_from_line(){
  if [[ -z "${1}" || -z "${2}" || -z "${3}" || ${#} -ne 3 ]]; then
    return 1;
 fi

 local file pattern string;
 file="${1}"
 pattern="${2}"
 string="${3}"

#  sed -ie "/${line}/ s/\(\<${string}\>\(\s\|,\|,\s\)\|\(\s\|,\|,\s\)\<${string}\>$\)//" "${file}"
  sed -ie "/${pattern}/ s/\(\s\<${string}\>\(,\|\s\)\|\(\s\|,\|,\s\)\<${string}\>$\)/\ /;/${pattern}/ s/\s*$//; /${pattern}/ s/,$//" "${file}"

  return ${?}
}
