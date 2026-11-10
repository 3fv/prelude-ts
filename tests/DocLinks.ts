import { readFileSync } from "fs"
import { Vector, Future } from "@3fv/prelude-ts"
import rp from "request-promise-native"

// Sites such as Wikipedia reject requests without a User-Agent (403), and
// GitHub rate-limits bursts of page fetches (429), so every request names a
// generic client and 429 responses are retried after the advertised delay.
const USER_AGENT = "prelude-ts-doc-link-check"
const MAX_ATTEMPTS = 6
const MAX_RETRY_DELAY_MS = 30000
const LINK_CHECK_TIMEOUT_MS = 600000

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

async function fetchUrl(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rp({ uri: url, headers: { "User-Agent": USER_AGENT } })
    } catch (err) {
      if (err.statusCode !== 429 || attempt >= MAX_ATTEMPTS) {
        throw err
      }
      const retryAfterSeconds = Number(err.response?.headers?.["retry-after"])
      const retryDelayMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 2000 * attempt
      console.log(`Rate-limited on ${url}, retrying in ${retryDelayMs}ms...`)
      await delay(Math.min(retryDelayMs, MAX_RETRY_DELAY_MS))
    }
  }
}

// www.npmjs.com answers every automated client with a Cloudflare challenge
// (403, `cf-mitigated: challenge`), so a package page link is verified through
// the registry document of the same package, which is 404 when it is gone.
function toCheckableUrl(url: string): string {
  const npmPackage = url.match(
    /^https?:\/\/(?:www\.)?npmjs\.com\/package\/((?:@[^/]+\/)?[^/?#]+)/
  )
  return npmPackage ? `https://registry.npmjs.org/${npmPackage[1]}` : url
}

function checkUrlsInText(
  text: string,
  urlFilter: (url: string) => boolean
): Future<Vector<string>> {
  const matches = text.match(/https?:.+?(?=[\s\)"'])/g)
  if (matches === null) {
    throw new Error("no URLs found in the text")
  }
  const urls = Vector.ofIterable(matches).filter(urlFilter)
  return Future.traverse(
    urls,
    (url) => {
      console.log(`Checking ${url}...`)
      return Future.of(fetchUrl(toCheckableUrl(url)))
    },
    { maxConcurrent: 3 }
  )
}

describe("documentation links work", function () {
  this.timeout(LINK_CHECK_TIMEOUT_MS)
  it("README.md", async () => {
    const contents = readFileSync("README.md").toString()
    await checkUrlsInText(contents, (_) => true)
  })
  it("User Guide", async () => {
    const userGuide = await fetchUrl(
      "https://github.com/emmanueltouzery/prelude.ts/wiki/Prelude.ts-user-guide"
    )
    await checkUrlsInText(
      userGuide,
      (url) => url.indexOf("emmanuel") >= 0 && !url.endsWith(".git")
    )
  })
  it("Equality Guide", async () => {
    const userGuide = await fetchUrl(
      "https://github.com/emmanueltouzery/prelude.ts/wiki/Equality"
    )
    await checkUrlsInText(
      userGuide,
      (url) => url.indexOf("emmanuel") >= 0 && !url.endsWith(".git")
    )
  })
})
