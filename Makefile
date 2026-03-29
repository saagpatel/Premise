.PHONY: dev build test lint clean install

install:
	pnpm install

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

clean:
	rm -rf node_modules dist .next .turbo
