import React from 'react'
import fetch from 'cross-fetch'

import { List, ListItem } from '@chakra-ui/react'
import Link from '../../components/link'
import { CLIENT_ID, SITE_ID } from '../../constants'

const ContentSearch = ({ contentResult }) => {
    if (!contentResult) {
        return <div>Loading...</div>
    }

    const { hits = [] } = contentResult
    return (
        <div>
            {hits.length ? (
                <List>
                    {hits.map(({ id, name }) => (
                        <Link key={id} to={`/content/${id}`}>
                            <ListItem>{name}</ListItem>
                        </Link>
                    ))}
                </List>
            ) : (
                <div>No Content Items Found!</div>
            )}
        </div>
    )
}

ContentSearch.getProps = async () => {
    let contentResult
    //Make a call to the URL substituting Key Values from table
    const res = await fetch(
        `http://localhost:3000/mobify/proxy/ocapi/s/${SITE_ID}/dw/shop/v20_2/content_search?q=about&client_id=${CLIENT_ID}`
    )
    if (res.ok) {
        contentResult = await res.json()
    }
    if (process.env.NODE_ENV !== 'production') {
        console.log(contentResult)
    }
    return { contentResult }
}

ContentSearch.getTemplateName = () => 'content-search'

export default ContentSearch