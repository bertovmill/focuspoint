const BASE = "https://api.linkedin.com";

function getCredentials() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  if (!token || !personUrn) {
    throw new Error("LinkedIn credentials not configured. Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN.");
  }
  return { token, personUrn };
}

function linkedInHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": "202406",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

async function uploadImage(token: string, personUrn: string, imageUrl: string): Promise<string> {
  // Step 1: initialize upload
  const initRes = await fetch(`${BASE}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner: personUrn } }),
  });
  if (!initRes.ok) {
    throw new Error(`LinkedIn image init failed: ${await initRes.text()}`);
  }
  const initJson = (await initRes.json()) as {
    value: { uploadUrl: string; image: string };
  };
  const { uploadUrl, image: imageAssetUrn } = initJson.value;

  // Step 2: fetch the image bytes and upload
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image from URL: ${imageUrl}`);
  const imgBuffer = await imgRes.arrayBuffer();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": imgRes.headers.get("content-type") ?? "image/jpeg" },
    body: imgBuffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`LinkedIn image upload failed: HTTP ${uploadRes.status}`);
  }

  return imageAssetUrn;
}

export async function postToLinkedIn(
  text: string,
  imageUrl?: string,
): Promise<{ id: string; url: string }> {
  const { token, personUrn } = getCredentials();

  let media: object[] | undefined;
  if (imageUrl) {
    const assetUrn = await uploadImage(token, personUrn, imageUrl);
    media = [{ status: "READY", description: { text: "" }, media: assetUrn, title: { text: "" } }];
  }

  const body: Record<string, unknown> = {
    author: personUrn,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (media) {
    body.content = {
      media: {
        altText: "",
        id: (media[0] as { media: string }).media,
      },
    };
    body.mediaCategory = "IMAGE";
  }

  const res = await fetch(`${BASE}/rest/posts`, {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`LinkedIn post failed: ${await res.text()}`);
  }

  // LinkedIn returns the post URN in the x-restli-id header
  const postUrn = res.headers.get("x-restli-id") ?? "";
  const postId = postUrn.split(":").pop() ?? postUrn;

  return {
    id: postId,
    url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}`,
  };
}
