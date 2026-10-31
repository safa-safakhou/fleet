FROM python:3.12.13-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36 AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/fleet
COPY requirements.lock /opt/fleet/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY src /opt/fleet/src
ENV PYTHONPATH=/opt/fleet/src
USER 10001:10001
ENTRYPOINT ["python", "-m", "fleet_research.cli_entry"]
FROM runtime AS isolation-test
COPY tests/test_isolation.py /opt/fleet/isolation_probe.py
ENTRYPOINT ["python", "/opt/fleet/isolation_probe.py"]
