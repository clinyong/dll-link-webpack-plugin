SHELL := /bin/bash
export PATH := $(shell pwd)/node_modules/.bin:$(PATH)

watch:
	tsc -w

build:
	tsc

publish:build
	npm publish