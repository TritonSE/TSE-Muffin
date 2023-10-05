# muffin 🧁

_matching up future friends inexpensively_

muffin is an open-source, self-hosted Slack bot that pairs people up on a regular basis. By default, you'll meet someone new every two weeks.

muffin is inspired by [donut](https://www.donut.com/). Although muffin has fewer features, if your team has more than 24 people, or you want to enable pairings in multiple channels, then hosting muffin yourself is ~10x cheaper than donut's paid plans.

## Setup

muffin has a Node.js backend and uses MongoDB, so you'll need to provide both of those.

> You can get a free MongoDB instance through [Atlas](https://www.mongodb.com/atlas/database), and there are many good options for backend hosting. In particular, the [provided Dockerfile](Dockerfile) is known to work on [DigitalOcean App Platform](https://www.digitalocean.com/products/app-platform), which costs $5/month.

### Create a Slack app

1. [Click here](https://api.slack.com/apps?new_app=1&manifest_json=%7B%22display_information%22%3A%7B%22name%22%3A%22muffin%22%2C%22description%22%3A%22matching%20up%20future%20friends%20inexpensively%22%2C%22background_color%22%3A%22%5Cu0023774400%22%7D%2C%22features%22%3A%7B%22bot_user%22%3A%7B%22display_name%22%3A%22muffin%22%2C%22always_online%22%3Afalse%7D%7D%2C%22oauth_config%22%3A%7B%22scopes%22%3A%7B%22bot%22%3A%5B%22app_mentions%3Aread%22%2C%22channels%3Aread%22%2C%22chat%3Awrite%22%2C%22groups%3Aread%22%2C%22im%3Ahistory%22%2C%22im%3Aread%22%2C%22im%3Awrite%22%2C%22mpim%3Aread%22%2C%22mpim%3Awrite%22%2C%22reactions%3Awrite%22%2C%22users%3Aread%22%2C%22reactions%3Aread%22%5D%7D%7D%2C%22settings%22%3A%7B%22event_subscriptions%22%3A%7B%22request_url%22%3A%22https%3A%2F%2Fexample.com%2Fslack%2Fevents%22%2C%22bot_events%22%3A%5B%22app_mention%22%2C%22message.im%22%2C%22reaction_added%22%2C%22reaction_removed%22%5D%7D%2C%22org_deploy_enabled%22%3Afalse%2C%22socket_mode_enabled%22%3Afalse%2C%22token_rotation_enabled%22%3Afalse%7D%7D) to create a new, pre-configured app in your workspace.

   > Alternatively, you can create a new app and paste in [manifest.json](manifest.json) manually, using [these steps](https://api.slack.com/reference/manifests#creating_apps).

1. [Install the app to your workspace.](https://api.slack.com/start/distributing#single_workspace_apps) You may have been prompted to do this after creating the app.

### Set environment variables

See [.env.example](.env.example) for the environment variables you'll need to configure.

### Deploy the backend

You can either use the [Dockerfile](Dockerfile), or do it the old-fashioned way:

```sh
npm install
npm run build
npm start
```

### Subscribe to events

In your app's event subscription request URL, you should change the domain from `example.com` to your domain, but keep the `/slack/events` path. See [these instructions](https://api.slack.com/apis/connections/events-api#subscribing) for details.

### Test your deployment

If you send muffin the word "help" as a direct message, it should react to your message with a checkmark, and reply with a list of commands. Your direct message with muffin is essentially a command-line interface.

## Usage

To schedule pairings, use the following command:

```
round_schedule #my-channel 2023-06-05T10:00:00-0700 2w
```

Everyone in that channel will be paired up at the specified date and time. This is an ISO 8601 date string; be sure to replace `-0700` with the offset of your time zone.

`2w` specifies a duration of two weeks. Also try days (`4d`) or even hours and minutes (`1h10m`).

You can repeat this command with different dates (and even channels) to schedule as many rounds as you like. If you're scheduling multiple consecutive rounds in the same channel, you can schedule the first one as usual, then use `round_repeat #my-channel`.
