import path from "node:path";

const repoRoot = process.cwd();

const quote = (value) => JSON.stringify(value);

const inWorkspace = (workspace, file) => {
  const relativePath = path.relative(repoRoot, file);
  return (
    relativePath === workspace ||
    relativePath.startsWith(`${workspace}${path.sep}`)
  );
};

const commandForWorkspace = (workspaceName, workspaceDir, files) => {
  const workspaceFiles = files.filter(
    (file) => inWorkspace(workspaceDir, file) && /\.(ts|tsx)$/.test(file)
  );

  if (workspaceFiles.length === 0) {
    return null;
  }

  return `pnpm --filter ${workspaceName} exec eslint --fix ${workspaceFiles
    .map(quote)
    .join(" ")}`;
};

export default {
  "**/*": (files) => {
    const commands = [];

    if (files.length > 0) {
      commands.push(
        `prettier --write --ignore-unknown ${files.map(quote).join(" ")}`
      );
    }

    const apiCommand = commandForWorkspace("stoat-admin-api", "api", files);
    if (apiCommand) {
      commands.push(apiCommand);
    }

    const webCommand = commandForWorkspace("stoat-admin-web", "web", files);
    if (webCommand) {
      commands.push(webCommand);
    }

    return commands;
  }
};
