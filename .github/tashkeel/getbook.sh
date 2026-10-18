#!/bin/bash
# all the pages of a Shamela book from its branches into /tmp/shp/raw/<book>
b=$1;mkdir -p /tmp/shp/raw/$b
for br in $(gh api 'repos/itheoryofmind/SIRA/branches?per_page=100' --jq '.[].name' | grep "^sh-$b-"); do
  rm -rf /tmp/shp/x && git clone -q --depth 1 --branch $br https://github.com/itheoryofmind/SIRA /tmp/shp/x && cp -n /tmp/shp/x/shamela/$b/* /tmp/shp/raw/$b/ ; rm -rf /tmp/shp/x
done; echo $b $(ls /tmp/shp/raw/$b | wc -l)
