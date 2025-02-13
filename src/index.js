import axios from "axios";
import express from "express";
import xmlBodyParser from "express-xml-bodyparser";
const app = express();
app.use(xmlBodyParser());

const MAKE_WEBHOOK =
  "https://hook.us2.make.com/ytj4vvlhjc1v46c2owkkyw55n2kahd8b";
app.get("/", (req, res) => res.send("Express on Vercel"));

app.get("/api/youtube", async (req, res) => {
  const results = [];
  let pageToken = null;
  const baseURL = "https://www.googleapis.com/youtube/v3/search";
  const { channelId, publishedBefore, publishedAfter, key } = req.query;

  console.log(req.query);
  try {
    do {
      const response = await axios.get(baseURL, {
        params: {
          part: "snippet",
          channelId: channelId,
          maxResults: 50,
          type: "video",
          key: key,
          pageToken: pageToken,
          publishedAfter: publishedAfter,
          publishedBefore: publishedBefore,
          order: "date",
        },
      });

      results.push(...response.data.items);
      pageToken = response.data.nextPageToken || null;
    } while (pageToken);

    res.json(results);
  } catch (error) {
    if (error.response) {
      throw new Error(
        `YouTube API Error: ${error.response.data.error.message}`
      );
    }
    throw error;
  }
});

app.get("/api/pubsub/callback", async (req, res) => {
  const channelId = "UChIs72whgZI9w6d6FhwGGHA";
  if (!req.query["hub.challenge"])
    return res.status(400).send("No challenge provided");

  if (!req.query["hub.mode"] || req.query["hub.mode"] !== "subscribe")
    return res.status(400).send("Invalid mode");

  /* if (!req.query["hub.topic"] || !req.query["hub.topic"].includes(channelId))
    return res.status(400).send("Invalid topic"); */

  console.log(`Verification Challenge Received from Hub`);

  try {
    return res.send(req.query["hub.challenge"]);
  } catch (error) {
    console.error("Error verifying:", error);
    return res.status(500).send("Internal Server Error");
  }
});

// PubSubHubbub POST handler
app.post("/api/pubsub/callback", async (req, res) => {
  console.log("Received PubSub notification");
  res.sendStatus(200);
  try {
    const entry = req.body.feed?.entry?.[0];
    if (entry) {
      const videoId = entry["yt:videoid"]?.[0];
      const channelId = entry["yt:channelid"]?.[0];
      const title = entry["title"]?.[0];
      const published = entry["published"]?.[0];

      const response = await axios.post(MAKE_WEBHOOK, {
        videoId: videoId,
        channelId: channelId,
        title: title,
        published: published,
      });

      console.log(entry);

      console.log(
        `New video: ${videoId}  , Channel: ${channelId}, Title: ${title}, ID: ${response}`
      );
    }
  } catch (error) {
    console.error("Error processing notification:", error);
  }
});

app.listen(3000, () => console.log("Server ready on port 3000."));

export default app;
