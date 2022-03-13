#!/bin/bash -e

NPM_TAG=${1}

if [[ -z "${NPM_TAG}" ]];then
  echo "package version must be provided"
  exit 255
fi

NPM_VERSION=$(cat package.json | jq .version)

git push --tags
echo Publishing

./scripts/prepare.sh
cp README.md lib/

pushd lib
yarn publish . --from-package --non-interactive --tag ${NPM_TAG}
popd
git push


echo "Successfully released version ${NPM_VERSION} with tag ${NPM_TAG}!"