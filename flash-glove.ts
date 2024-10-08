import { readdir, unlink } from "node:fs/promises";
import { $ } from "bun";
import { Octokit } from "octokit";
import { z } from "zod";
import { env } from "./env";

const OWNER = "andrewjleung";
const REPO = "zmk-config";
const LEFT_GLOVE_LOCATION = "/Volumes/GLV80LHBOOT";
const RIGHT_GLOVE_LOCATION = "/Volumes/GLV80RHBOOT";
const TEMP_PATH = "./temp.zip";
const EXTRACTED_PATH = "./glove80.uf2";

const octokit = new Octokit({ auth: env.GITHUB_PAT });

const artifactSchema = z.object({
	id: z.number(),
	archive_download_url: z.string().url(),
	created_at: z.coerce.date(),
});

type Artifact = z.infer<typeof artifactSchema>;

const artifactResponseSchema = z.object({
	artifacts: z.array(artifactSchema),
});

async function dirExists(path: string) {
	try {
		await readdir(path);
		return true;
	} catch (err) {
		return false;
	}
}

async function getLatestArtifact(): Promise<Artifact | null> {
	const artifacts = await octokit.rest.actions
		.listArtifactsForRepo({
			owner: OWNER,
			repo: REPO,
		})
		.then((res) => artifactResponseSchema.parse(res.data))
		.then((res) => res.artifacts);

	const latestArtifact = artifacts
		.sort((a, b) => b.id - a.id) // Trusting that these are strictly increasing
		.reverse()
		.pop();

	return latestArtifact || null;
}

async function downloadArtifact(id: number): Promise<void> {
	const response = await octokit.rest.actions.downloadArtifact({
		owner: OWNER,
		repo: REPO,
		artifact_id: id,
		archive_format: "zip",
	});

	const artifactUrl = z.object({ url: z.string().url() }).parse(response).url;
	const res = await fetch(artifactUrl).then((res) => res.arrayBuffer());
	await Bun.write(TEMP_PATH, res);
}

async function checkGlovesConnected() {
	const errors: string[] = [];
	const leftGloveExists = await dirExists(LEFT_GLOVE_LOCATION);
	const rightGloveExists = await dirExists(LEFT_GLOVE_LOCATION);

	if (!leftGloveExists) {
		errors.push(
			"Left glove not connected in bootloader mass storage device mode",
		);
	}

	if (!rightGloveExists) {
		errors.push(
			"Right glove not connected in bootloader mass storage device mode",
		);
	}

	if (errors.length > 0) {
		console.error(errors.join("\n"));
		process.exit(1);
	}
}

async function main() {
	await checkGlovesConnected();

	const latestArtifact = await getLatestArtifact();

	if (latestArtifact === null) {
		console.error("No artifacts found");
		process.exit(1);
	}

	console.log(
		`Flashing artifact from ${latestArtifact.created_at.toLocaleTimeString()}`,
	);

	await downloadArtifact(latestArtifact.id);
	await $`unzip ${TEMP_PATH}`;

	const uf2 = Bun.file(EXTRACTED_PATH);
	await Bun.write(`${LEFT_GLOVE_LOCATION}/glove80.uf2`, uf2);
	await Bun.write(`${RIGHT_GLOVE_LOCATION}/glove80.uf2`, uf2);

	await unlink(TEMP_PATH);
	await unlink(EXTRACTED_PATH);
}

await main();
process.exit(0);
