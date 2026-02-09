# Test komutları - Backend ve Frontend
.PHONY: test test-backend test-e2e smoke

test: test-backend test-e2e

test-backend:
	cd md.service && python -m pytest tests -q --tb=short

test-e2e:
	cd md.web && npm run test:e2e

smoke:
	python scripts/smoke.py
