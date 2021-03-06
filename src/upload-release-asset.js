const core = require('@actions/core');
const github = require('@actions/github');
const fastglob = require('fast-glob');
const nodeFs = require('fs');
const nodePath = require('path');
const mime = require('mime-types');

async function run() {
  // catch thrown errors
  let op;
  try {
    // initial
    op='repo = github.context.repo';
    const repo = github.context.repo;

    // Get the inputs from the workflow file: https://github.com/actions/toolkit/tree/master/packages/core#inputsoutputs
    // const token = core.getInput( 'repo-token', { required: true } );
    // const uploadUrl = core.getInput('upload_url', { required: true });
    op='core.getInput(files, { required: true })';
    const glob = core.getInput('files', { required: true });

    // let contentType = core.getInput('content_type');

    // Get authenticated GitHub client (Ocktokit): https://github.com/actions/toolkit/tree/master/packages/github#usage
    op='core.getInput(github-token)';
    let token = core.getInput('github_token');
    op='octokit = new github.GitHub(token)';
    const octokit = new github.GitHub(token);

    // if ( tag )
    // {
    //   core.debug( `Getting release id for ${tag}...` );
    //   const release = await octokit.repos.getReleaseByTag( { ...repo, tag } );
    //   release_id = release.data.id
    // }

    // sanity: release action
    const action = github.context.payload.action;
    if ( !['published','created','prereleased'].includes(action) )
    {
      core.setFailed(`Cannot upload assets for release.type: ${action}`)
      return;
    }

    // sanity: release_id
    op=`release_id = github.context.payload.release.id`;
    const release_id = github.context.payload.release.id;
    if ( !release_id )
    {
      core.setFailed('Could not find release');
      return;
    }
    core.debug(`Uploading assets to release: ${release_id}...`);

    // build files array
    op=`filepaths = await fastglob( glob.split( ';' ) )`;
    const filepaths = await fastglob( glob.split( ';' ) );
    if (!filepaths.length) {
      core.setFailed( 'No files found' );
      return;
    }

    // get release data
    op=`await octokit.repos.getRelease( { ...repo, release_id } )`;
    const { data: { upload_url: url } } = await octokit.repos.getRelease( { ...repo, release_id } );
    op=`await octokit.repos.listAssetsForRelease( { ...repo, release_id } )`;
    const { data: existingAssets } = await octokit.repos.listAssetsForRelease( { ...repo, release_id } );

    // upload
    for ( let filepath of filepaths )
    {
      const existingAsset = existingAssets.find( a => a.name === filepath );
      if ( existingAsset ) {
        core.debug( `Removing existing asset '${filepath}' with ID ${existingAsset.id}...` );
        op=`octokit.repos.deleteReleaseAsset(${filepath})`;
        octokit.repos.deleteReleaseAsset( {...repo, asset_id: existingAsset.id } )
      }

      op=`contentType = mime.lookup(${filepath}) || 'application/zip'`;
      let contentType = mime.lookup(filepath) || 'application/zip';

      console.log(`Uploading ${filepath}...`);
      core.debug(`Content-Type = '${contentType}'`);

      const headers = {
        'content-type': contentType,
        'content-length': nodeFs.statSync(filepath).size
      };

      // Upload a release asset
      // API Documentation: https://developer.github.com/v3/repos/releases/#upload-a-release-asset
      // Octokit Documentation: https://octokit.github.io/rest.js/#octokit-routes-repos-upload-release-asset
      const name = nodePath.basename(filepath);
      const file = nodeFs.createReadStream(filepath);
      op=`uploadAssetResponse = await octokit.repos.uploadReleaseAsset({ url, headers, name, file })`;
      const uploadAssetResponse = await octokit.repos.uploadReleaseAsset({ url, headers, name, file });
    }

    // Get the browser_download_url for the uploaded release asset from the response
    // const { data: { browser_download_url: browserDownloadUrl } } = uploadAssetResponse;

    // Set the output variable for use by other actions: https://github.com/actions/toolkit/tree/master/packages/core#inputsoutputs
    // core.setOutput('browser_download_url', browserDownloadUrl);
  }
  catch (error) {
    core.setFailed(`${op}: ${error.message}`);
  }
}

module.exports = run;
