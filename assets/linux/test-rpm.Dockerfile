FROM valecompanion-linux-test:local AS packages
FROM fedora:43 AS runtime
RUN dnf install -y gtk3 nss alsa-lib mesa-libgbm libpcap libcap \
    xorg-x11-server-Xvfb xorg-x11-xauth file procps-ng which \
    shadow-utils util-linux dbus-x11 sudo && dnf clean all
RUN useradd --create-home --uid 1000 tester
FROM runtime
COPY --from=packages /usr/local/bin/bun /usr/local/bin/bun
COPY --from=packages /usr/local/bin/node /usr/local/bin/node
WORKDIR /workspace
COPY package.json ./
COPY src/smoke-packaged-linux.ts ./src/smoke-packaged-linux.ts
COPY --from=packages /workspace/dist/*.rpm /packages/
COPY assets/linux/test-rpm.sh /workspace/test-rpm.sh
CMD ["bash", "/workspace/test-rpm.sh"]
