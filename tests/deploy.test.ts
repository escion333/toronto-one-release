import assert from "node:assert/strict";
import test from "node:test";
import { deploymentConfig, healthMatches, imageFromLogs } from "../scripts/deploy.mts";

const repository =
  "registry.cloudflare.com/2d1132aadb6f2dd369f0b914b2df9678/toronto-one-remote";
const image = `${repository}@sha256:${"a".repeat(64)}`;
const nextImage = `${repository}@sha256:${"b".repeat(64)}`;

test("deployment rejects local builds and mutable tags before requesting credentials", () => {
  for (const base of [
    { dockerfile: "../../Dockerfile" },
    { image: `${repository}:latest` },
    { image, dockerfile: "../../Dockerfile" },
  ]) {
    assert.throws(() =>
      deploymentConfig({ main: "worker.mjs", containers: [{ images: { base } }] }),
    );
  }
  const config = { main: "worker.mjs", containers: [{ images: { base: { image } } }] };
  assert.equal(
    deploymentConfig(config, nextImage).containers[0]?.images.base.image,
    nextImage,
  );
  assert.equal(config.containers[0]?.images.base.image, image);
});

test("remote build evidence must identify one immutable image in the expected registry repository", () => {
  assert.equal(imageFromLogs(`Pushed ${image}\n${image}`, image), image);
  assert.throws(() => imageFromLogs("Build failed; no digest", image));
  assert.throws(() => imageFromLogs(`${image}\n${nextImage}`, image));
  assert.throws(() => imageFromLogs(image, image.replace("2d1132aa", "1d1132aa")));
});

test("health confirmation requires both configured and running image to match the remote build", () => {
  assert.equal(
    healthMatches({ ok: true, configuredImage: image, runningImage: image }, image),
    true,
  );
  assert.equal(
    healthMatches({ ok: true, configuredImage: image, runningImage: nextImage }, image),
    false,
  );
  assert.equal(
    healthMatches({ ok: false, configuredImage: image, runningImage: image }, image),
    false,
  );
  assert.equal(healthMatches({ ok: true }, image), false);
});
