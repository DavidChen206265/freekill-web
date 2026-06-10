#!/bin/bash
cd /home/david/freekill-asio/packages || exit 1
keep="freekill-core sp standard_ex utility"
for d in */; do
  n="${d%/}"
  skip=0
  for k in $keep; do [ "$n" = "$k" ] && skip=1; done
  if [ "$skip" = "0" ]; then
    echo "removing $n"
    rm -rf "./$n"
  fi
done
echo "=== remaining ==="
ls -d */
