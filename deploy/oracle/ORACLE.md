# Running Holy Roof Rides on Oracle Cloud (free, forever)

This walks you through putting your church's server on Oracle Cloud's
"Always Free" tier — a real computer on the internet that costs nothing,
stays on all the time, and gets your congregation a proper `https://`
address instead of everyone typing in a local network number. You don't
need to know anything about servers already. Where you need to click
something, this doc names the exact button.

Budget about 30–45 minutes the first time. You'll do this once.

**What you'll end up with:** a small cloud computer running your church's
server around the clock, reachable at an address like
`https://holeylift.duckdns.org` from the app and from the deacon portal.

---

## 1. Create your Oracle Cloud account

Before you start, know this one thing: **when you sign up, Oracle asks you
to pick a "home region," and you cannot change it later.** Pick whichever
Oracle datacenter region is geographically closest to your church (Oracle
lists them by city/country during signup). This affects speed slightly and,
occasionally, availability — more on that below.

1. Go to **[oracle.com/cloud/free](https://www.oracle.com/cloud/free/)** and
   click **Start for free**.
2. Fill in your email, verify it, then fill in your name and address.
3. Pick your **home region** (see the note above — this is permanent).
4. Oracle will ask for a credit card. This is only to verify you're a real
   person — Oracle Always Free resources are never charged, and Oracle
   makes you explicitly upgrade before anything can cost money. Enter your
   card and finish signup.
5. Once you're in, go to your account's **Billing** area and switch from
   "Always Free" to **Pay As You Go**. This sounds backwards, but it's the
   right move: pure "Always Free" accounts get their compute reclaimed if
   Oracle decides it's sitting idle, while a Pay As You Go account with only
   Always-Free-eligible resources still costs **$0** but doesn't get
   reclaimed. There's no downside — you're never charged unless you
   deliberately create something outside the free limits.

If, later, creating your VM says something like **"Out of host capacity,"**
that's Oracle's free ARM tier being popular in that region that day — it's
not you doing anything wrong. See the troubleshooting table at the bottom.

## 2. Create the virtual machine (VM)

1. In the Oracle Cloud Console (the hamburger menu, top left), go to
   **Compute > Instances**.
2. Click **Create instance**.
3. Give it a name, e.g. `holy-roof-rides`.
4. Under **Image and shape**, click **Edit**.
   - **Image:** click **Change image**, choose **Canonical Ubuntu**,
     version **24.04**.
   - **Shape:** click **Change shape**, choose the **Ampere** family, then
     **VM.Standard.A1.Flex**. Set **1 OCPU** and **6 GB memory**. (Oracle's
     Always Free tier gives you up to 4 OCPUs / 24 GB total across ARM
     instances — 1/6 is plenty for a church, and leaves room if you ever
     want a second small instance.)
5. Under **Add SSH keys**, leave "Generate a key pair for me" selected and
   click **Save private key** — this downloads a `.key` file. **Keep this
   file safe**; it's the only way to log into your server. (If you already
   have your own SSH key pair, you can upload your public key instead.)
6. Leave networking settings as the defaults and click **Create**.
7. Wait a minute or two for the instance's state to turn green
   (**Running**). On the instance's detail page, note its **Public IP
   address** — you'll need it twice below.

## 3. Open the cloud firewall

Oracle's network sits in front of your VM and blocks everything by default
except SSH. You need to open the ports the app uses.

1. On your instance's detail page, find **Primary VNIC** and click the
   subnet link next to it (it's under the **Virtual cloud network** for
   your instance — click the VCN name, then click the subnet name).
2. Click the **Security Lists** link, then click the **Default Security
   List** for that VCN.
3. Click **Add Ingress Rules**.
4. Add a rule:
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** TCP
   - **Destination Port Range:** `80,443`
5. Click **Add Ingress Rules** to save.

(If you're using `--no-https` — see step 5 below — use destination port
`8787` instead of `80,443`.)

This step alone is **not** enough — Ubuntu itself also blocks these ports
out of the box. The setup script in step 5 handles that side; this step
only opens Oracle's outer gate.

## 4. Get a free HTTPS domain name

Your server needs a real domain name to get a free, trusted `https://`
address (via Let's Encrypt, automatically — you don't do anything extra
for that part).

1. Go to **[duckdns.org](https://www.duckdns.org)**.
2. Click **Sign in with GitHub** (top right) — if your church already has a
   GitHub account from setting up this app, use that one. No new password
   to create.
3. Under **add domain**, type a subdomain name — something like
   `holeylift` works well — and click **add domain**. You now have
   `holeylift.duckdns.org`.
4. In the row for your new domain, find the **ip** field and enter your
   VM's **Public IP address** from step 2. Click **update ip**.
5. Copy the **token** shown at the top of the page (a long string of
   letters and numbers) — you'll paste it in the next step. Keep this page
   open or copy the token somewhere safe.

## 5. Log in and run the setup script

1. Open PowerShell on your Windows computer.
2. SSH into your new server, pointing at the `.key` file you downloaded in
   step 2:

   ```
   ssh -i path\to\your-key.key ubuntu@YOUR_VM_PUBLIC_IP
   ```

   Type `yes` if asked whether to trust the host.
3. Paste this command, replacing `holeylift.duckdns.org` and `TOKEN` with
   your own subdomain and the token you copied in step 4:

   ```
   curl -fsSL https://raw.githubusercontent.com/shaver3josiah/holy-roof-rides/main/deploy/oracle/setup.sh \
     | bash -s -- --domain holeylift.duckdns.org --duckdns-token TOKEN
   ```

   This installs everything, starts the server, and takes a few minutes.
   Watch the numbered progress lines — it'll end with a summary block
   showing your server's address.

   **Skipping HTTPS?** If you'd rather not deal with a domain name (fine for
   a quick test, not recommended for real use — see `docs/RELEASING.md`'s
   note on HTTP vs HTTPS), run the same command with `--no-https` instead of
   `--domain`/`--duckdns-token`, and use port `8787` in step 3 above.

## 6. Point the app at your server

1. In the app, open **Settings** and enter your server's address:
   `https://holeylift.duckdns.org` (or `http://YOUR_VM_IP:8787` if you used
   `--no-https`).
2. Join using the founding-deacon bootstrap code. To read it, back in your
   SSH session:

   ```
   sudo journalctl -u holyroofrides | grep -i bootstrap
   ```

   This only prints while your server has zero members — the first person
   who joins with it becomes the founding deacon.
3. The deacon portal lives at the same address with `/portal` on the end,
   e.g. `https://holeylift.duckdns.org/portal` — open that in any browser.

Note: the `npm run demo:seed` script mentioned elsewhere in this repo is for
spinning up fake practice data on a throwaway machine — never run it
against your church's real server, it's not meant for that.

## 7. (Optional) Turn on auto-deploy

Once this is working, you can set things up so that future updates to the
app deploy to your server automatically instead of you re-running the
script by hand. That's covered in the auto-deploy section of
[`docs/RELEASING.md`](../../docs/RELEASING.md) — you'll add three repository
secrets under your GitHub repo's **Settings > Secrets and variables >
Actions**:

| Secret | Value |
|---|---|
| `VM_HOST` | your VM's public IP address (from step 2) |
| `VM_SSH_KEY` | the full contents of the `.key` file you downloaded in step 2 |
| `VM_USER` | `ubuntu` |

---

## Troubleshooting

| Problem | What's going on | What to do |
|---|---|---|
| "Out of host capacity" when creating the VM | Oracle's free ARM shape is popular; your region is temporarily full | Wait a while and try again, or try a different Availability Domain if your region has more than one. Remember region itself can't be changed after signup. |
| Browser/app says "connection refused" or times out | Almost always one of two firewalls, not the app | Check **both**: the OCI Security List (step 3) allows the port, **and** the setup script's iptables step actually ran (re-run the script — it's safe to repeat). Both have to allow the traffic. |
| `holeylift.duckdns.org` doesn't resolve, or `curl`/`ssh` can't find your domain | DNS takes a minute to spread after you set the IP in DuckDNS | Wait a minute or two and try again. Double-check step 4.4 actually shows your VM's IP next to your subdomain. |
| Setup script says it needs passwordless sudo | Unusual account setup on the VM | This should just work on a fresh Oracle Ubuntu image logged in as `ubuntu`. If you changed users or hardened sudo, run `sudo -v` first. |
