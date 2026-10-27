# Research and model-route qualification

Read through authorized Renpō routes on 2026-10-27.

## Access needs and prior work

[DOTS RPG Access Friendly Gaming](https://www.dotsrpg.org/access-friendly-gaming) emphasizes individual access needs, experimentation with players, and lived experience. This informs the prototype's distinction between a mathematical preservation check and useful human accessibility. We have not conducted a player study.

[Meeple Like Us](https://www.meeplelikeus.co.uk/meeple-like-us-masterlist/) assesses games across several access categories and links grades to detailed teardowns and caveats. Accessible tabletop presentation and evaluation are established work. OPEN TABLE does not claim to invent them. Its narrower hypothesis is that executable original rules plus explicit information-preserving adaptation checks can help designers catch strategic or hidden-information changes before playtesting.

## NVIDIA and Nebius

The [NVIDIA Nano 2 VL cookbook](https://docs.nvidia.com/nemotron/0.1.0/usage-cookbook/Nemotron-Nano2-VL/README.html) describes the 12B multimodal family and links its FP8/BF16 models. [Nebius's October 2025 announcement](https://nebius.com/blog/posts/nvidia-nemotron-nano-2-vl-in-ai-studio) documents prior hosting of Nano 2 VL. Those documents establish a possible technical direction, not current account access or a present model deployment.

The actual [current Token Factory catalog](https://tokenfactory.nebius.com/model-catalog.md), fetched 2026-10-27, lists newer NVIDIA models including Nemotron 3.5 Super VL. The seed's Nano 2 VL was absent from that public Markdown snapshot. Account-specific availability must still be read through the authorized model-list route before choosing an invocation. A modern suitable NVIDIA vision-language model may serve the same OPEN TABLE outcome; an old seed model name is not a reason to fabricate availability.

The [official API introduction](https://docs.tokenfactory.nebius.com/api-reference/introduction) and [live OpenAPI schema](https://api.tokenfactory.nebius.com/openapi.json) specify the OpenAI-compatible chat endpoint and authenticated model listing. Both model-list and completion paths require bearer authentication. Credentials belong in an existing authorized server-side context, never the browser, project source, messages, or receipts.

The current coordinator 1 process had none of the four documented Nebius/NVIDIA key variables configured; no `nebius` executable was found. This is a scoped observation of that process, not a verdict on other machines, accounts, stores, or authenticated sessions. The existing unified-auth workstream is [hamon #1630](https://github.com/Jacob-Met/hamon/issues/1630). No credential store was scanned, no new key created, and no paid inference or resource expansion attempted.

## Prepared experiment

The offline experiment uses static authored rule phrases, components and opaque synthetic fixture descriptions. It never takes live hands, pending cards, player identities, full state keys, or private fixture truth as model input.

Four development goals cover named shapes/text and explicit switch confirmation in the two games. Two authored reserved cases add a scoring or early-disclosure change to a legitimate access request. They require variant routing; a passing original adapter alone cannot certify the whole changed request.

The deterministic baseline is a declared keyword/catalog selector with limited rule-change detection. Compare actual future model output on classification, necessary targets and cited source references, then review rationale truth and usefulness. Additional citations or a passing checker are not automatically quality improvements.

Record exact prepared input, source/prompt revision, rule pin, model/route identity, unmodified response, latency, usage/cost, validation, independent checks, and author disposition. No actual model result, model advantage or platform qualification is claimed yet.
