CLD

CLD is an AI coding agent that runs directly in your terminal. It can read and edit your code, execute commands, search your project, run tests, inspect Git changes, and search the web.

Powered by OpenRouter.

---

Requirements

- Node.js 18+
- npm
- OpenRouter API key

---

Installation

1. Clone the repository

git clone https://github.com/ropuk019/open-cld.git
cd open-cld

2. Install CLD

cd install
npm install
npm install -g .

3. Start CLD

cld

---

OpenRouter API Key

CLD requires an OpenRouter API key to use AI models.

Get your API key from:

https://openrouter.ai/

When CLD starts, follow the configuration prompts to set up your API key and model.

---

Commands

Start CLD

cld

Start the interactive AI coding agent.

---

Help

/help

Show available commands.

---

Clear Screen

/clear

Clear the terminal screen.

---

Exit

/exit

Exit CLD.

You can also use:

/quit

---

Memory

/memory

View or manage persistent agent memory.

---

Spawn Agent

/spawn

Spawn a new agent task.

---

Output Style

/output-style

Change the agent's output style.

---

What Can CLD Do?

You can simply tell CLD what you want to do.

Analyze a project

Analyze this project and explain how it works.

Fix a bug

Find and fix the login bug in this project.

Create a feature

Add dark mode to this website.

Edit files

Update the homepage and make the design more modern.

Run commands

Install the dependencies and start the project.

Run tests

Run the tests and fix any errors you find.

Git

Check the current git diff and explain what changed.

Research

Search the web and find the latest documentation for this API.

CLD will decide which tools it needs to complete the task.

---

Available Agent Tools

CLD can use the following tools:

Tool| Description
"read_file"| Read a file
"write_file"| Create or overwrite a file
"edit_file"| Edit an existing file
"execute_command"| Run a terminal command
"list_files"| List files and directories
"search_content"| Search inside files
"search_file"| Find files
"run_tests"| Run project tests
"git_diff"| View Git changes
"web_search"| Search the web

---

Termux

CLD can also be installed on Termux.

pkg update
pkg install nodejs git

Then:

git clone https://github.com/ropuk019/open-cld.git
cd open-cld/install
npm install
npm install -g .

Run:

cld

If you want to work with files in Android shared storage:

termux-setup-storage

«Tip: It's recommended to clone and run CLD from the Termux home directory instead of "/storage/emulated/0/".»

---

Security

CLD can execute terminal commands and modify files.

Always review commands and changes before using them in important or production projects.

Never share or commit your OpenRouter API key.

---

License

MIT
