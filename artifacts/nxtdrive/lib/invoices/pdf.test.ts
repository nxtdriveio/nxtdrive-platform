import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicIp, isLogoUrlFetchSafe } from "./pdf";

test("isPublicIp blocks loopback / private / link-local / metadata", () => {
  for (const ip of [
    "127.0.0.1",
    "0.0.0.0",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1",
    "169.254.169.254", // cloud metadata
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
  ]) {
    assert.equal(isPublicIp(ip), false, `${ip} must be blocked`);
  }
});

test("isPublicIp allows public unicast addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "2606:4700:4700::1111"]) {
    assert.equal(isPublicIp(ip), true, `${ip} must be allowed`);
  }
  assert.equal(isPublicIp("not-an-ip"), false);
});

test("isLogoUrlFetchSafe rejects non-https and internal literal IPs", async () => {
  assert.equal(await isLogoUrlFetchSafe("http://example.com/logo.png"), false);
  assert.equal(await isLogoUrlFetchSafe("ftp://example.com/logo.png"), false);
  assert.equal(await isLogoUrlFetchSafe("not a url"), false);
  assert.equal(await isLogoUrlFetchSafe("https://127.0.0.1/logo.png"), false);
  assert.equal(await isLogoUrlFetchSafe("https://169.254.169.254/latest/meta-data"), false);
  assert.equal(await isLogoUrlFetchSafe("https://[::1]/logo.png"), false);
});

test("isLogoUrlFetchSafe allows an https public literal IP", async () => {
  assert.equal(await isLogoUrlFetchSafe("https://8.8.8.8/logo.png"), true);
});
