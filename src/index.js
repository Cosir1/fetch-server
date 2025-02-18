import axios from "axios";
import express, { response } from "express";
import xmlBodyParser from "express-xml-bodyparser";
const app = express();
app.use(xmlBodyParser());

const MAKE_WEBHOOK_SEND_NEW_VIDEO =
  "https://hook.us2.make.com/ytj4vvlhjc1v46c2owkkyw55n2kahd8b";
const MAKE_WEBHOOK_SEND_SUBSCRIPTION =
  "https://hook.us2.make.com/9f3n2wwmuy37d7qezcgymil5d6int37b";

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

app.get("/api/youtube/new", async (req, res) => {
  const { publishedAfter, publishedBefore, channelId, key } = req.query;
  try {
    const channelsResponse = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: {
          part: "contentDetails",
          id: channelId,
          key: key,
        },
      }
    );

    const uploadsPlaylistId =
      channelsResponse.data.items[0].contentDetails.relatedPlaylists.uploads;
    let results = [];
    let pageToken = null;

    do {
      const playlistResponse = await axios.get(
        "https://www.googleapis.com/youtube/v3/playlistItems",
        {
          params: {
            part: "snippet",
            playlistId: uploadsPlaylistId,
            maxResults: 50,
            key: key,
            pageToken: pageToken,
          },
        }
      );

      results.push(...playlistResponse.data.items);
      pageToken = playlistResponse.data.nextPageToken || null;
    } while (pageToken);

    const filteredVideos = results.filter((item) => {
      const publishedAt = new Date(item.snippet.publishedAt);
      const afterDate = publishedAfter ? new Date(publishedAfter) : new Date(0);
      const beforeDate = publishedBefore
        ? new Date(publishedBefore)
        : new Date(8640000000000000);

      return publishedAt >= afterDate && publishedAt <= beforeDate;
    });
    console.log("Total results: " + filteredVideos.length);
    res.json(filteredVideos);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json({
        error: `YouTube API Error: ${error.response.data.error.message}`,
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.get("/api/pubsub/callback", async (req, res) => {
  if (!req.query["hub.challenge"])
    return res.status(400).send("No challenge provided");

  if (!req.query["hub.mode"] || req.query["hub.mode"] !== "subscribe")
    return res.status(400).send("Invalid mode");

  /* if (!req.query["hub.topic"] || !req.query["hub.topic"].includes(channelId))
    return res.status(400).send("Invalid topic"); */

  console.log(`Verification Challenge Received from Hub`);
  sendSubscriptionToMake({
    hubCallback: req.query["hub.callback"],
    hubChallenge: req.query["hub.challenge"],
    hubLease: req.query["hub.lease_seconds"],
    hubMode: req.query["hub.mode"],
    hubTopic: req.query["hub.topic"],
  });
  try {
    return res.send(req.query["hub.challenge"]);
  } catch (error) {
    console.error("Error verifying:", error);
    return res.status(500).send("Internal Server Error");
  }
});

const sendSubscriptionToMake = async ({
  hubChallenge,
  hubCallback,
  hubLease,
  hubMode,
  hubTopic,
}) => {
  const response = await axios.post(MAKE_WEBHOOK_SEND_SUBSCRIPTION, {
    hubChallenge: hubChallenge,
    hubTopic: hubTopic,
    hubMode: hubMode,
    hubLease: hubLease,
    hubCallback: hubCallback,
  });
  console.log("Sending Subscription Response: " + response.data);
};

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

      const response = await axios.post(MAKE_WEBHOOK_SEND_NEW_VIDEO, {
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

// Renew PubSubHubbub Subscription Endpoint
app.get("/api/pubsub/renew", async (req, res) => {
  const hubUrl = "https://pubsubhubbub.appspot.com/subscribe";
  const channelId = "UCMtJYS0PrtiUwlk6zjGDEMA";
  const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
  const callbackUrl =
    "https://fetch-server-production.up.railway.app/api/pubsub/callback";
  try {
    await axios.post(hubUrl, null, {
      params: {
        "hub.callback": callbackUrl,
        "hub.topic": topicUrl,
        "hub.mode": "subscribe",
        "hub.verify": "async",
        "hub.lease_seconds": 604800, // 7 days
        // "hub.secret": process.env.PUBSUB_SECRET // Uncomment if using a secret
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    console.log("PubSubHubbub subscription renewed successfully");
    res.send("Subscription renewed successfully");
  } catch (error) {
    console.error("Subscription renewal failed:", error.message);
    res.status(500).send("Failed to renew subscription");
  }
});

app.listen(3000, () => console.log("Server ready on port 3000."));

export default app;
