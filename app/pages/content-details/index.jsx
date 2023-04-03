import React from 'react'
import fetch from 'cross-fetch'

import {HTTPError} from 'pwa-kit-react-sdk/ssr/universal/errors'
import { CLIENT_ID, SITE_ID } from '../../constants'

const ContentDetails = ({contentResult}) => {
    if (!contentResult) {
        return <div>Loading...</div>
    }

    return <div dangerouslySetInnerHTML={{__html: contentResult.c_body}} />
 }

ContentDetails.getProps = async ({params}) => {
    let contentResult
    const result = await fetch(
        `http://localhost:3000/mobify/proxy/ocapi/s/${SITE_ID}/dw/shop/v20_2/content/${params.id}?client_id=${CLIENT_ID}`
    )

    if (result.ok) {
        contentResult = await result.json()
    } else {
        const error = await result.json()
        throw new HTTPError(result.status, error.fault.message)
    }

   return {contentResult}
}

ContentDetails.getTemplateName = () => 'content-details'

export default ContentDetails