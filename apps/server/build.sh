rm -rf dist && \
tsc -p tsconfig.prod.json && \
tsc-alias -p tsconfig.prod.json --resolve-full-paths
cp ../../cloudbuild.yaml ./dist
