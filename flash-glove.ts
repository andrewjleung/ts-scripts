import { Octokit } from "octokit";
import { z } from "zod";
import { env } from "./env";

const OWNER = "andrewjleung";
const REPO = "zmk-config";

const octokit = new Octokit({ auth: env.GITHUB_PAT });

const artifactSchema = z.object({
	id: z.number(),
	archive_download_url: z.string().url(),
	created_at: z.coerce.date(),
});

const artifactResponseSchema = z.object({
	artifacts: z.array(artifactSchema),
});

const artifacts = await octokit
	.request("GET /repos/{owner}/{repo}/actions/artifacts", {
		owner: OWNER,
		repo: REPO,
		headers: {
			"X-GitHub-Api-Version": "2022-11-28",
		},
	})
	.then((res) => artifactResponseSchema.parse(res.data))
	.then((res) => res.artifacts);

const latestArtifact = artifacts
	.sort((a, b) => b.created_at.getUTCSeconds() - a.created_at.getUTCSeconds())
	.reverse()
	.pop();

if (latestArtifact === undefined) {
	console.error("No artifacts found");
	process.exit(1);
}

const res = await fetch(latestArtifact.archive_download_url);
const path = "./glove.uf2.zip";
await Bun.write(path, res);
