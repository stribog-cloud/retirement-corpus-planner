.PHONY: all format lint static trailer-check test test-unit coverage build artifact-check artifact-write docs-screenshots test-smoke test-e2e test-a11y test-charter-docs ui-tokens ui-contrast ui-perf doc-gate secrets vulnerability clean

all: format lint static trailer-check build artifact-check coverage test-smoke test-e2e test-a11y ui-tokens ui-contrast ui-perf doc-gate test-charter-docs secrets vulnerability

format:
	npm run format

lint:
	npm run lint

static:
	npm run static
	npm run test:e2e:offline-load

trailer-check:
	npm run trailer:check

test: coverage

test-unit:
	npm run test:unit

coverage:
	npm run coverage

build:
	npm run build

artifact-check:
	npm run artifact:check

artifact-write:
	npm run artifact:write

docs-screenshots:
	npm run docs:screenshots

test-smoke:
	npm run test:smoke

test-e2e:
	npm run test:e2e

test-a11y:
	npm run test:a11y

test-charter-docs:
	npm run test:charter-docs

ui-tokens:
	npm run ui:tokens

ui-contrast:
	npm run ui:contrast

ui-perf:
	npm run ui:perf

doc-gate:
	npm run doc:gate

secrets:
	npm run secrets

vulnerability:
	npm run vulnerability

clean:
	rm -rf dist coverage

# ---- Developer setup ----
.PHONY: setup-hooks
setup-hooks:
	git config core.hooksPath .githooks
	@echo "✓ git hooks configured to use .githooks/"
	@echo "  pre-commit hook will run gitleaks + trailer-check on every commit."
	@command -v gitleaks >/dev/null 2>&1 || \
	  echo "⚠ gitleaks not installed. Install with: brew install gitleaks"
